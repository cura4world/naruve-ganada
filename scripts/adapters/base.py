"""어댑터 공통 인터페이스.

    assess(audio_path, ref_text, enable_miscue) -> dict

반환값은 **엔진의 원본 응답을 그대로** 담은 dict다. 여기서 요약하거나
평탄화하지 않는다. 프로브의 목적이 스키마를 알아내는 것이므로, 지금
필요 없어 보이는 필드가 나중에 답이 된다. 가공은 pa_report.py에서만
한다.

`enable_miscue`에 기본값을 두지 않는다. 이 값은 채점 방식 자체를
바꾸는데(azure.py 참조), 기본값이 있으면 무엇으로 쟀는지 모르는 결과가
쌓인다. 실제로 그럴 뻔했다 — 하네스는 true로 박혀 있었고 Speech Studio
측정은 전부 false였다. 호출부가 매번 명시하게 한다.
"""


class NotConfigured(Exception):
    """키나 설정이 없어 부를 수 없는 상태. 고장이 아니다."""


class Adapter:
    name = "base"

    # 이 엔진을 부르는 데 필요한 환경변수 이름
    required_keys = ()

    # 키가 없을 때 화면에 찍을 안내. 한 줄에 하나
    setup_hint = ()

    # 이 엔진에 마지막으로 보낸 평가 설정. 호출부가 결과와 함께 기록한다.
    # 무엇을 보냈는지 남기지 않으면 응답만 보고는 재구성할 수 없다.
    last_config = None

    def available(self):
        """키가 다 있으면 True. 호출부는 False면 건너뛴다."""
        import os

        return all(os.environ.get(k) for k in self.required_keys)

    def assess(self, audio_path, ref_text, enable_miscue):
        raise NotImplementedError
