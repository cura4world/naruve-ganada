"""온디바이스 어댑터 — 자리만. 미구현.

DECISIONS.md 8.2: 원가 0이지만 **LM이 나쁜 발음을 교정해 뱉을**
가능성이 높다. 인식기는 알아듣는 것이 목적이라, 학습자가 "반가씀니다"를
"반가스미다"로 발음해도 언어모델이 그럴듯한 문장으로 되돌려 놓는다.
그러면 채점 근거가 사라진다.

그래서 이 어댑터의 검증 질문은 다른 둘과 다르다. "점수가 정확한가"가
아니라 **"오류가 결과에 남아 있기는 한가"**다. 인식 결과가 오류 샘플과
정상 샘플에서 동일하게 나오면 그 시점에 기각이다.

이 자리를 비워 두지 않는 이유는 DECISIONS.md 10절 때문이다. 온디바이스가
기각되면 무료 모드는 발음 채점을 아예 하지 않고 억양·속도·인식 통과
여부만 본다. 그 분기가 이 어댑터의 결과에 걸려 있으므로 후보 목록에서
빠지면 안 된다.

구현은 브라우저/안드로이드 쪽이라 이 파이썬 하네스에서 돌지 않는다.
별도 지시가 있을 때 형태를 정한다.
"""

from .base import Adapter


class OnDeviceAdapter(Adapter):
    name = "ondevice"
    required_keys = ()
    setup_hint = (
        "미구현. 온디바이스 인식은 이 파이썬 하네스에서 돌지 않는다.",
        "검증 질문: 점수의 정확도가 아니라 오류가 결과에 남는지 여부다.",
    )

    is_stub = True

    def available(self):
        return False

    def assess(self, audio_path, ref_text, enable_miscue):
        raise NotImplementedError(
            "온디바이스 어댑터는 자리만 있다. DECISIONS.md 8.2 / 10절 참조."
        )
