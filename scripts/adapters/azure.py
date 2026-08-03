"""Azure 발음평가 어댑터.

ko-KR / scripted / granularity=Phoneme / EnableMiscue=true

스크립트형(scripted) 평가다. DECISIONS.md 8.1 — 참조 오디오는 채점에
쓰이지 않는다. 참조 **텍스트**만 넘어가고 채점은 "사용자 음성 vs 텍스트
유도 음향모델" 비교다. 그래서 오류 가설 재채점(4.1)이 성립한다.
같은 오디오에 참조 텍스트만 바꿔 다시 부를 수 있다.

주의 — 이 파일의 REST 규격은 **실호출로 검증되지 않았다.**
작성 시점에 learn.microsoft.com이 egress 정책에 막혀 공식 문서를 직접
읽지 못했다(DECISIONS.md 14절). 헤더 이름, 쿼리 파라미터, PA 설정 JSON의
키 표기는 첫 실행에서 확인해야 한다. 401이 아닌 400이 오면 여기부터
의심한다. 응답 본문을 그대로 찍으므로 무엇이 틀렸는지는 바로 보인다.
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
        # 음소 이름이 빈 문자열로 오는지가 (B)의 핵심 질문이다.
        # 알파벳을 지정하면 결과가 달라질 수 있으므로 기본값은
        # "지정하지 않음"이다. 한 번은 지정 없이, 한 번은 IPA로 돌려
        # 비교하라 — docs/PROBE.md 참조.
        alphabet = os.environ.get("AZURE_PHONEME_ALPHABET")
        if alphabet:
            cfg["PhonemeAlphabet"] = alphabet
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

        # 원본 그대로. 여기서 손대지 않는다.
        return json.loads(body)
