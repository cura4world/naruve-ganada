"""Azure 발음평가 어댑터.

ko-KR / scripted / granularity=Phoneme / EnableMiscue=true

스크립트형(scripted) 평가다. DECISIONS.md 8.1 — 참조 오디오는 채점에
쓰이지 않는다. 참조 **텍스트**만 넘어가고 채점은 "사용자 음성 vs 텍스트
유도 음향모델" 비교다. 그래서 오류 가설 재채점(4.1)이 성립한다.
같은 오디오에 참조 텍스트만 바꿔 다시 부를 수 있다.


## 응답 스키마 — 2026-08-07 실측으로 확정

Speech Studio 발음평가 도구(ko-KR, Prosody assessment 체크)에 폰 녹음
4문장을 넣어 확인했다. 우리 코드를 한 줄도 거치지 않은 응답이므로
이것이 정답지다.

    [ { Id, RecognitionStatus, Offset, Duration, Channel, DisplayText, SNR,
        NBest: [ {
          Confidence, Lexical, ITN, MaskedITN, Display,
          PronunciationAssessment: {
            AccuracyScore, FluencyScore, CompletenessScore, PronScore },
          Words: [ {
            Word, Offset, Duration,
            PronunciationAssessment: { AccuracyScore, ErrorType },
            Syllables: [ { Syllable, PronunciationAssessment:{AccuracyScore},
                           Offset, Duration } ],
            Phonemes:  [ { Phoneme,
                           PronunciationAssessment: {
                             AccuracyScore,
                             NBestPhonemes: [ {Phoneme, Score} ] },
                           Offset, Duration } ] } ] } ] } ]

확정된 것 넷.

1. **ProsodyScore는 오지 않는다.** Studio에서 Prosody assessment를 켜도
   ko-KR 응답에는 없었다(4/4 샘플). 그래서 이 어댑터도
   EnableProsodyAssessment를 켜지 않는다. 억양 층은 pitch.js가 계속
   맡는다 — DECISIONS.md 10절.
2. **Phoneme·Syllable 이름은 항상 빈 문자열이다.** NBestPhonemes의
   Phoneme도 마찬가지다. 정렬은 이름이 아니라 순서와 Offset으로만 된다.
3. 다만 **NBestPhonemes의 Score에는 값이 있다.** 이름이 없어도 2순위
   점수가 높으면(50~80) 그 자리에서 소리가 흔들렸다는 신호로 읽을 수
   있다. 오류 가설 재채점의 보조 신호다.
4. **채점은 표준발음형 기준이다.** "많이" 어절의 Phonemes가 4개로 왔다
   (표기형 ㅁㅏㄴㅎㅣ 5, 표준발음 [마니] ㅁㅏㄴㅣ 4). 음절 분할도 발음
   기준이라 [마][니]로 나뉜다. 우리가 G2P로 표준발음을 만들어 넣을
   필요가 없다 — 표기형을 그대로 보내면 Azure가 변환한다.

응답을 뜯을 때 **가정하면 안 되는 것 둘.** 실측에서 둘 다 어긋났다.

- **Syllables가 없는 어절이 있다.** 7어절 중 6어절에는 표기 음절 수와
  정확히 같은 개수로 왔지만 "만나서"에는 배열이 통째로 없었다.
  받침 ㄴ + 초성 ㄴ이 한 소리로 병합되어 음소가 6개(정상 7개)로 잡혔고
  3-2-2 분할이 불가능해진 것으로 **추정**한다. 같은 자음이 연달아
  만나는 경우에만 생기는 것으로 보이나 표본 1건이라 확정은 아니다.
- **Words가 참조 텍스트의 띄어쓰기를 따르지 않는다.** "저는
  한국사람입니다"가 Words 2개로 왔고 "한국사람입니다"가 한 덩어리가
  되면서 AccuracyScore 59 / ErrorType Mispronunciation, 문장
  CompletenessScore가 50으로 떨어졌다. 타일은 참조 텍스트가 아니라
  **응답의 Words**로 그려야 한다.

**요청 규격은 아직 미검증이다.** 위 실측은 Speech Studio가 만든
요청에 대한 것이라 우리 요청에 대해서는 아무것도 증명하지 못한다.
엔드포인트 경로·쿼리, 헤더 이름, PA 설정 JSON 키 표기, Content-Type의
codec·samplerate는 첫 실호출에서 확인해야 한다. 401이 아닌 400이 오면
여기부터 의심한다. 응답 본문을 그대로 찍으므로 무엇이 틀렸는지는 바로
보인다. PROBE.md 1-b 참조.
"""

import base64
import json
import os
import urllib.error
import urllib.request

from .base import Adapter, NotConfigured


class AzureAdapter(Adapter):
    name = "azure"
    required_keys = ("SPEECH_KEY", "SPEECH_REGION")
    setup_hint = (
        "Azure Portal → Speech 리소스 → Keys and Endpoint",
        "SPEECH_KEY = KEY 1 또는 KEY 2",
        "SPEECH_REGION = koreacentral 같은 지역 코드",
        "egress: *.api.cognitive.microsoft.com, *.cognitiveservices.azure.com",
    )

    def _endpoint(self):
        region = os.environ["SPEECH_REGION"]
        return (
            "https://%s.stt.speech.microsoft.com"
            "/speech/recognition/conversation/cognitiveservices/v1"
            "?language=ko-KR&format=detailed" % region
        )

    def _pa_header(self, ref_text):
        cfg = {
            "ReferenceText": ref_text,
            "GradingSystem": "HundredMark",
            "Granularity": "Phoneme",
            "Dimension": "Comprehensive",
            "EnableMiscue": True,
        }
        # ProsodyScore는 켜지 않는다. Studio에서 켜고 부른 ko-KR 응답에도
        # 오지 않았다(위 실측 1번). 켜봐야 요청 규격만 하나 더 늘어난다.

        # 실측에서 Phoneme 이름은 전부 빈 문자열이었다. 알파벳을 지정하면
        # 이름이 채워지는지는 아직 확인되지 않았다. 기본값은 "지정하지
        # 않음" — Studio 응답과 같은 조건이라, 결과가 어긋나면 우리 요청
        # 탓임이 바로 갈린다. IPA로 한 번 더 돌려 비교한다. PROBE.md 4단계.
        alphabet = os.environ.get("AZURE_PHONEME_ALPHABET")
        if alphabet:
            cfg["PhonemeAlphabet"] = alphabet

        # NBestPhonemes는 **요청해야 온다.** Studio 응답에는 음소마다 5개씩
        # 들어 있었고 이름은 빈 문자열이지만 Score에는 값이 있다(실측 3번).
        # 이 키를 빼면 그 신호가 아예 응답에 없으므로 기본을 5로 둔다.
        # 다만 키 표기는 요청 규격이라 미검증이다. 400이 오면 이 줄이
        # 첫 번째 용의자다 — AZURE_NBEST_PHONEMES=0 으로 끄고 다시 부른다.
        try:
            nbest = int(os.environ.get("AZURE_NBEST_PHONEMES", "5"))
        except ValueError:
            nbest = 5
        if nbest > 0:
            cfg["NBestPhonemeCount"] = nbest

        raw = json.dumps(cfg, ensure_ascii=False).encode("utf-8")
        return base64.b64encode(raw).decode("ascii")

    def assess(self, audio_path, ref_text):
        if not self.available():
            raise NotConfigured("SPEECH_KEY / SPEECH_REGION")

        with open(audio_path, "rb") as fh:
            audio = fh.read()

        req = urllib.request.Request(
            self._endpoint(),
            data=audio,
            method="POST",
            headers={
                "Ocp-Apim-Subscription-Key": os.environ["SPEECH_KEY"],
                "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
                "Pronunciation-Assessment": self._pa_header(ref_text),
                "Accept": "application/json",
                "User-Agent": "naruve-probe",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = resp.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")
            raise RuntimeError("HTTP %s — %s" % (e.code, detail[:600]))

        # 원본 그대로. 여기서 손대지 않는다. RecognitionStatus가 Success가
        # 아닌 응답도 그대로 저장한다 — 무엇이 인식되지 않았는지가 정보다.
        return json.loads(body)
