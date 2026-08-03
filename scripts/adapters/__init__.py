"""발음평가 엔진 어댑터.

DECISIONS.md 8.4: 엔진을 고르지 말고 세 개를 같은 자로 재고 나서 고른다.
그래서 프로브가 엔진을 직접 부르지 않고 어댑터를 통해 부른다. 엔진을
하나 더 붙이는 비용이 파일 하나로 끝나야 그 방침이 실제로 지켜진다.

공통 인터페이스는 base.Adapter를 본다.
"""

from . import azure, etri, ondevice

REGISTRY = {
    "azure": azure.AzureAdapter,
    "etri": etri.EtriAdapter,
    "ondevice": ondevice.OnDeviceAdapter,
}


def get(name):
    if name not in REGISTRY:
        raise KeyError(
            "모르는 엔진: %s  (가능한 값: %s)" % (name, " / ".join(sorted(REGISTRY)))
        )
    return REGISTRY[name]()


def names():
    return sorted(REGISTRY)
