"""ETRI 발음평가 어댑터 — 골격만. 규격 미확인.

DECISIONS.md 8.2: ETRI는 **외국인의 한국어 발음평가를 명시적 용도로
표방**하는 유일한 후보다. Azure가 영어 우선 설계의 한국어 이식인 것과
대비된다. 그래서 후보에서 빼지 않는다.

다만 지금은 골격뿐이다. 확인되지 않은 것이 셋이다.

  TODO(1) 엔드포인트와 요청 스키마
          e-PreTX(epretx.etri.re.kr) 발음평가 API의 정확한 URL,
          요청 본문 필드 이름, 오디오 인코딩 방식(base64 여부),
          응답 구조를 확인해야 한다. 작성 시점에 egress가 막혀
          문서를 읽지 못했다.

  TODO(2) 어절/음소 단위 결과를 주는가
          안 주면 (A)(B)(C) 표의 절반이 비고, 8.6의 타일 단위
          결정에 쓸 수 없다. 총점만 준다면 용도가 완전히 달라진다.

  TODO(3) 상업 이용 약관
          DECISIONS.md 8.2에 "상업 이용 약관 확인 필수"로 적혀 있다.
          연구 체험 플랫폼 성격이라 SLA와 지속성이 불확실하다.
          **약관 확인 전에는 실호출하지 않는다.** 기술 검증보다
          이쪽이 먼저다 — 쓸 수 없는 것으로 밝혀지면 나머지 확인이
          전부 낭비다.

규격이 확정되면 assess()만 채우면 된다. 호출부는 손대지 않는다.
"""

import os

from .base import Adapter, NotConfigured


class EtriAdapter(Adapter):
    name = "etri"
    required_keys = ("ETRI_API_KEY",)
    setup_hint = (
        "ETRI 오픈 API 포털에서 발급받은 키를 ETRI_API_KEY에 넣는다.",
        "egress: epretx.etri.re.kr",
        "먼저 상업 이용 약관을 확인한다 — DECISIONS.md 8.2 TODO(3).",
    )

    # 규격이 확정되면 False로 바꾼다.
    is_stub = True

    def assess(self, audio_path, ref_text, enable_miscue):
        if not self.available():
            raise NotConfigured("ETRI_API_KEY")
        raise NotImplementedError(
            "ETRI 어댑터는 아직 골격이다. scripts/adapters/etri.py의 "
            "TODO(1)~(3)을 먼저 해결한다. 상업 이용 약관 확인이 우선이다."
        )

    def endpoint(self):
        """TODO(1): 확인되면 실제 URL로 바꾼다."""
        return os.environ.get("ETRI_ENDPOINT", "")
