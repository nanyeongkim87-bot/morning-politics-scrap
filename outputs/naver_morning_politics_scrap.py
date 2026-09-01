#!/usr/bin/env python3
"""
Naver newspaper politics scraper.

Fetches article titles from Naver's newspaper pages and prints the requested
morning politics clipping format. It uses only Python's standard library.
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import re
import sys
import time
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


PRESS_ORDER = [
    ("조선일보", "조선", "023"),
    ("중앙일보", "중앙", "025"),
    ("동아일보", "동아", "020"),
    ("경향신문", "경향", "032"),
    ("한겨레", "한겨레", "028"),
    ("국민일보", "국민", "005"),
    ("서울신문", "서울", "081"),
    ("세계일보", "세계", "022"),
    ("한국일보", "한국", "469"),
]

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)


def load_external_rules() -> dict:
    rules_path = Path(__file__).resolve().parents[1] / "rules" / "current.json"
    if not rules_path.exists():
        return {}
    with open(rules_path, "r", encoding="utf-8") as file:
        return json.load(file)


EXTERNAL_RULES = load_external_rules()


def external_matched_phrases(title: str, phrases: Iterable[str]) -> list[str]:
    return [phrase for phrase in phrases if phrase and phrase in title]


def external_score_title(title: str) -> tuple[int, list[dict]]:
    score = 0
    matches: list[dict] = []
    for rule in EXTERNAL_RULES.get("positiveSignals", []) + EXTERNAL_RULES.get("negativeSignals", []):
        phrases = external_matched_phrases(title, rule.get("phrases", []))
        if not phrases:
            continue
        rule_score = int(rule.get("score", 0))
        score += rule_score
        matches.append({"reason": rule.get("reason", "unnamed-rule"), "score": rule_score, "phrases": phrases})
    return score, matches


def external_politics_decision(title: str) -> bool | None:
    if external_matched_phrases(title, EXTERNAL_RULES.get("forceExcludePhrases", [])):
        return False
    if external_matched_phrases(title, EXTERNAL_RULES.get("forceIncludePhrases", [])):
        return True
    score, _matches = external_score_title(title)
    threshold = int(EXTERNAL_RULES.get("scoreThreshold", 2))
    if score >= threshold:
        return True
    if score <= -2:
        return False
    return None

POLITICS_KEYWORDS = [
    "대통령",
    "대통령실",
    "청와대",
    "靑",
    "정부",
    "국정",
    "국무",
    "총리",
    "장관",
    "차관",
    "부처",
    "여당",
    "야당",
    "여야",
    "與",
    "野",
    "與野",
    "여권",
    "야권",
    "국회",
    "상임위",
    "본회의",
    "법사위",
    "운영위",
    "정무위",
    "환노위",
    "기재위",
    "국감",
    "청문회",
    "탄핵",
    "특검",
    "공수처",
    "검찰",
    "檢",
    "검사",
    "감사원",
    "선관위",
    "선거",
    "대선",
    "총선",
    "지선",
    "재보선",
    "후보",
    "경선",
    "전당대회",
    "전대",
    "당대표",
    "당권",
    "원내대표",
    "지도부",
    "최고위원",
    "최고위",
    "전준위",
    "선호투표제",
    "청년최고위원",
    "민주당",
    "민주",
    "국민의힘",
    "조국혁신당",
    "개혁신당",
    "진보당",
    "정의당",
    "더불어민주당",
    "국힘",
    "정당",
    "정치",
    "정치권",
    "의원",
    "원내",
    "입법",
    "법안",
    "발의",
    "상정",
    "형소법",
    "보완수사권",
    "보완수사",
    "수사권",
    "개헌",
    "시행령",
    "추경",
    "임명",
    "복당",
    "공천",
    "공방",
    "논평",
    "기자회견",
    "협상",
    "친명",
    "반청",
    "친청",
    "친석",
]

POLITICIAN_HINTS = [
    "이재명",
    "김민석",
    "정청래",
    "장동혁",
    "張",
    "정성호",
    "안규백",
    "김병기",
    "정이한",
    "김어준",
    "한동훈",
    "조국",
    "이준석",
    "김문수",
    "우상호",
]

CONTEXTUAL_POLITICS_KEYWORDS = [
    "규제",
    "예산",
    "인사",
    "사퇴",
    "징계",
    "협상",
    "의혹",
    "지지율",
    "탈영",
    "군무이탈",
]

POLITICAL_CONTEXT_HINTS = [
    "대통령",
    "정부",
    "국회",
    "정당",
    "정치",
    "정치권",
    "여당",
    "야당",
    "여야",
    "與",
    "野",
    "與野",
    "여권",
    "야권",
    "민주당",
    "민주",
    "국민의힘",
    "국힘",
    "조국혁신당",
    "개혁신당",
    "선관위",
    "선거",
    "대선",
    "총선",
    "특검",
    "검찰",
    "檢",
    "검사",
    "감사원",
    "공수처",
    "의원",
    "장관",
    "후보",
    "당대표",
    "당권",
    "전대",
    "전준위",
    "최고위",
    "선호투표제",
    "보완수사권",
    "보완수사",
    "형소법",
    "법안",
    "발의",
    "원내대표",
]

LOCAL_POLITICS_HINTS = [
    "시의회",
    "도의회",
    "구의회",
    "군의회",
    "지방의회",
    "시장",
    "도지사",
    "군수",
    "구청장",
]

FORCE_INCLUDE_TITLE_KEYWORDS = [
    "대통령 만난다",
    "대통령 접견",
    "대통령 예방",
    "이중당적 자율정리",
    "당원이 심판",
    "신천지’ 신경전",
    "신천지' 신경전",
    "문조털래유",
    "반명",
    "명청대전",
    "대세론",
    "역선택",
    "현역 의원",
    "시도지사 평가",
    "안갯속 판세",
    "송영길",
    "조작기소",
    "공소취소",
    "보완수사권",
    "폐지 보완책",
    "당내 ‘신중론’",
]

EXCLUDE_TITLE_KEYWORDS = [
    "[조수빈의 말로 사람 읽기]",
    "레이건",
    "공감 리더십",
    "두산에 SK실트론 지분 매각",
    "SK실트론",
    "캄보디아 스캠",
    "천즈",
    "중국 검찰 정식체포",
    "대통령배",
    "강속구",
    "덕수고",
    "체력검사",
    "장애 직원 폭행",
    "구의원",
    "전북도의원",
    "충남 여야의원",
    "발전통합본사",
    "파주메디컬클러스터",
    "조선대 선정",
    "[신문과 놀자!",
    "독립협회",
    "백정",
    "성소수자 축제",
    "베를린",
    "유럽 극우화",
    "일 총리",
    "압수 와인 바꿔치기",
    "뇌물 특사경",
    "냉방 천국",
    "찜통 지옥",
    "[씨줄날줄] 국가 정상의 타국 대선 개입",
    "3기 신도시",
    "정비사업",
    "최저임금 적용",
    "민주노총",
    "성범죄 해보고 싶다",
    "장윤기 고교시절",
    "[기고] 풀뿌리 민주주의",
    "폭염",
    "위기경보 '심각'",
    "축구협회장",
    "K-축구",
    "박지성",
    "佛·伊",
    "경찰 ‘정당방위 인정’",
    "[김병기의 필향만리]",
    "여권형 폴드",
    "여권형 갤폴드",
    "폴드8",
    "여권처럼 한손에",
    "여천NCC",
    "여천엔씨씨",
    "석화 구조조정",
    "석화",
    "SK하이닉스 성과급",
    "자사주 지급",
    "N% 성과급",
    "[글로벌 이슈",
    "수정 대통령",
    "다산 행정부",
    "초음파 검사",
    "기술평가",
    "디올 의류",
    "외국인 입국",
    "QR로 간편하게",
    "통합 입국 신고 시스템",
    "콜센터 노동자",
    "원청’ 정부 기관",
    "인신매매 피해 확인서",
    "산모등록제",
    "공공보건의원",
    "손흥민의 인터뷰",
    "무회전 킥",
    "산지관리법 시행령",
    "한교총·NCCK",
    "교계 의견 전달",
    "법제 전 분야",
    "통합 자문",
    "한국 여권 파워",
    "작은 영화관",
    "윤여정",
    "에미상",
    "여우조연상",
    "성난사람들",
    "성난 사람들",
    "英 패라지",
    "패라지",
    "쓰레기통 백작",
    "女총리",
    "여왕",
    "왕족",
    "양자입적",
    "이란",
    "하메네이",
    "르펜",
    "프랑스 극우",
    "대만 국방장관",
    "中 발사",
    "JL-2",
    "트러블 메이커",
    "美민주 상원의원",
    "상원의원 후보",
    "성폭행 스캔들",
    "日, 동의 없이 개인정보",
    "AI 업체",
    "농협",
    "양파값",
    "지자체 공조",
    "제주",
    "기후보험",
    "폭염 작업",
    "출산율 반등",
    "지역 지속가능성",
    "자생한방병원",
    "공장 한약",
    "그레이엄",
    "美 상원의원 별세",
    "최측근",
    "중국 서열",
    "베이징 온 북 총리",
    "북 총리 환대",
    "다카이치",
    "아베",
    "日 안팎 반발",
    "우클릭",
    "부처님 닮은 절",
    "종교적이되",
    "NYT 기자",
    "중간선거 앞둔 트럼프",
    "언론과 전쟁",
    "에어포스원",
    "보안 미비",
    "美국무",
    "쿠바",
    "전기트럭",
    "단거리 노선",
    "경제경영",
    "판타지",
    "무협",
    "로맨스",
    "배재고",
    "시민교육",
    "교사 정치편향",
    "교육감 선거",
    "직선제 폐지",
    "깜깜이 선거",
    "무효표",
    "인기 투표",
    "학교가 공약 도구",
    "용인 반도체 산단",
    "국토장관",
    "연내 착공",
    "통계조작 감사",
    "될 때까지 조사",
    "노조 없는 노동자",
    "노동회의소",
    "조완규",
    "전 장관 별세",
    "투표지 인쇄비",
    "선거관리 수고비",
    "인천 구의원",
    "임기 이틀 만에 탈당",
    "협회장 궐위",
    "체육회서 기한 연장",
    "한강 작가",
    "한강 노벨",
    "한강공원",
    "정치적 글쓰기",
    "국립국어원장",
    "이관규",
    "스토킹",
    "교제폭력",
    "현장 집행력",
    "JTBC 채권",
    "금융 검사",
    "현대차 임금협상",
    "부분파업",
    "삼성전자 노조",
    "호남 반도체",
    "조합원",
    "이스라엘",
    "네타냐후",
    "7선 총리",
    "석화 재편",
    "울산 산단",
    "샤힌",
    "국장 유인책",
    "롤러코스피",
    "개미들 탈출",
    "숨은 감염자",
    "확진자 치료",
    "서초",
    "인구의 날",
    "대통령 표창",
    "학폭 대응",
    "선거관리 예산집행",
    "여권 발급",
    "휴가철 앞두고",
    "WT논평",
    "American agriculture",
    "젤렌스키",
    "새로운 정치 전략",
    "에볼라",
    "민주콩고",
    "남수단",
    "드론전 영웅",
    "우크라 국방장관",
    "정서 학대",
    "아동복지법 개정",
    "의정부 아파트",
    "추락사",
    "숨진채 발견",
    "아르헨 대통령",
    "직관하면 질까봐",
    "TV로 결승전 시청",
    "소아 심장수술",
    "서울대병원",
    "윤희영의 News English",
    "버넘",
    "영국 총리",
    "북부의 왕",
    "다우닝가",
    "서킷브레이커",
    "사망세",
    "반도체 역풍론",
    "최태원",
    "K방산",
    "무인수상정",
    "바다의 드론",
    "마켓 나우",
    "기대수익률",
    "광주 군공항",
    "무안 이전",
    "생기부",
    "서울교육청 부실 관리",
    "세대교체",
    "미국 민주사회주의",
    "풀뿌리 제도권",
    "바퀴벌레당",
    "인도 청년",
    "우크라",
    "국방장관 경질",
    "강제 징집",
    "청도 운문사",
    "비구니",
    "승가대학",
    "GPU, 정부 투자",
    "북·러",
    "한반도 상황 관리",
    "풍력 바지선",
    "어로구역",
    "조업 방해",
    "ODA 연계 AI",
    "AI 해외진출",
    "경기북부",
    "철도망 구축",
    "니카라과",
    "오르테가",
    "대통령 장기 독재",
    "탁구 영재",
    "강시혁",
    "대통령기 초등부",
    "소아청소년과 의원",
    "진찰료",
    "영국 새 내각",
    "넘버2",
    "재무장관 컴백",
    "시스루 피플",
    "브라질 전 대통령",
    "미 영주권",
    "시선의 전복",
    "옥상이 품은",
    "민주적 가치",
    "유병호",
    "감사원 돌격대",
    "외로운 늑대",
    "민주주의 고향",
    "글로벌 인사이트",
    "선거 결과에도 돈",
    "세계·사람·생각",
    "특파원 리포트",
    "미국 중간선거",
    "K관광",
    "정부·통신 3사",
    "고물가 속 할인혜택",
    "우라늄 농축 허용",
    "한미 원자력협정",
    "성매매 시의원",
    "전기차 배터리",
    "초정밀 검사기술",
    "국방수권법안",
    "주한미군 감축",
    "깡패 출신 친일파",
    "농산물값",
    "정부 관리 물량",
    "대형마트 새벽배송",
    "의무휴업 완화",
    "[여의춘추]",
    "최저임금 협상",
    "국가대표 AI",
    "에이전트 능력",
    "정치 깡패 이정재",
    "MZ 조폭",
    "대학교수 노조 정치 활동",
    "교원노조법",
    "백신 불신론자",
    "홍역 환자",
]

FOREIGN_POLITICS_HINTS = [
    "英",
    "美 ",
    "美상원의원",
    "美 상원의원",
    "美민주",
    "美 민주",
    "日,",
    "일본",
    "이란",
    "프랑스",
    "대만",
    "中 ",
    "하메네이",
    "르펜",
    "패라지",
    "그레이엄",
    "상원의원 별세",
    "중국",
    "베이징",
    "북 총리",
    "北 총리",
    "다카이치",
    "아베",
    "日 ",
    "트럼프",
    "美국무",
    "쿠바",
    "NYT",
    "에어포스원",
    "이스라엘",
    "네타냐후",
    "젤렌스키",
    "우크라이나",
    "우크라",
    "민주콩고",
    "남수단",
    "버넘",
    "영국 총리",
    "다우닝가",
    "미국 민주사회주의",
    "인도 청년",
    "니카라과",
    "오르테가",
    "브라질",
    "사우디",
    "미 하원",
]

DOMESTIC_CENTRAL_HINTS = [
    "대통령",
    "대통령실",
    "청와대",
    "尹",
    "李",
    "국회",
    "민주당",
    "국민의힘",
    "국힘",
    "여당",
    "야당",
    "여야",
    "與",
    "野",
    "검찰",
    "특검",
    "공수처",
    "선관위",
    "법사위",
    "법안",
    "발의",
]

LEGAL_CASE_HINTS = [
    "영장 청구",
    "구속영장",
    "구속기소",
    "불구속기소",
    "기소",
    "압수수색",
    "재판",
    "법원",
    "대법",
    "수사",
    "혐의",
    "내란",
    "계엄",
    "특검",
]

LEGAL_POLITICAL_CONTEXT_HINTS = [
    "대통령",
    "대통령실",
    "청와대",
    "尹",
    "李",
    "국회",
    "의원",
    "민주당",
    "국민의힘",
    "국힘",
    "여당",
    "야당",
    "여야",
    "與",
    "野",
    "장관",
    "법안",
    "발의",
    "특검법",
    "탄핵",
    "공방",
]

INTERVIEW_HINTS = [
    "대통령",
    "총리",
    "장관",
    "차관",
    "지사",
    "시장",
    "대표",
    "의원",
    "당대표",
    "원내대표",
    "우상호",
    "이재명",
    "김민석",
    "정청래",
    "장동혁",
    "한동훈",
    "이준석",
    "안규백",
    "정성호",
]


@dataclass(frozen=True)
class Article:
    title: str
    url: str


class LinkParser(HTMLParser):
    def __init__(self, base_url: str) -> None:
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self._current_href: str | None = None
        self._current_text: list[str] = []
        self._anchor_depth = 0
        self.links: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag_name = tag.lower()
        void_tags = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

        if self._current_href is not None:
            if tag_name not in void_tags:
                self._anchor_depth += 1
            return

        if tag_name == "a":
            attr_map = {key.lower(): value for key, value in attrs}
            href = attr_map.get("href")
            if href:
                self._current_href = href
                self._current_text = []
                self._anchor_depth = 1

    def handle_endtag(self, tag: str) -> None:
        if self._current_href is None:
            return

        if self._anchor_depth > 1:
            self._anchor_depth -= 1
            return

        if tag.lower() == "a":
            text = normalize_text("".join(self._current_text))
            if text:
                self.links.append((text, urljoin(self.base_url, self._current_href)))
            self._current_href = None
            self._current_text = []
            self._anchor_depth = 0

    def handle_data(self, data: str) -> None:
        if self._current_href is not None:
            self._current_text.append(data)


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def fetch(url: str, timeout: int = 20) -> str:
    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.5,en;q=0.3",
        },
    )
    with urlopen(request, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def extract_newspaper_articles(press_id: str, yyyymmdd: str) -> list[Article]:
    url = f"https://media.naver.com/press/{press_id}/newspaper?date={yyyymmdd}"
    parser = LinkParser(url)
    parser.feed(fetch(url))

    articles: list[Article] = []
    seen: set[str] = set()
    pattern = re.compile(r"/article/newspaper/\d{3}/\d+")

    for title, link in parser.links:
        if not pattern.search(link):
            continue
        clean_url = link.split("#", 1)[0]
        clean_title = normalize_text(title)
        key = f"{clean_title}\n{clean_url}"
        if key in seen:
            continue
        seen.add(key)
        articles.append(Article(clean_title, clean_url))

    return articles


def is_exclusive(title: str) -> bool:
    return "[단독]" in title


def is_major_political_interview(title: str) -> bool:
    return "인터뷰" in title and any(word in title for word in INTERVIEW_HINTS)


def should_show_link(title: str) -> bool:
    return is_exclusive(title) or is_major_political_interview(title)


def has_central_political_context(title: str) -> bool:
    central_context_words = [
        "대통령",
        "대통령실",
        "청와대",
        "尹",
        "李",
        "정부",
        "국회",
        "민주당",
        "국민의힘",
        "국힘",
        "여당",
        "야당",
        "여야",
        "與",
        "野",
        "정당",
        "당대표",
        "당권",
        "전대",
        "최고위",
        "선관위",
        "법사위",
        "법안",
        "발의",
        "특검법",
        "탄핵",
        "계엄",
        "내란",
        "보완수사권",
        "보완수사",
        "형소법",
    ]
    return any(word in title for word in central_context_words + FORCE_INCLUDE_TITLE_KEYWORDS)


NON_CENTRAL_POLITICS_TITLE_KEYWORDS = [
    "\uc784\uc885\uc5b8",
    "\ub3c4\ud551\uac80\uc0ac",
    "\uc18c\uc7ac\uc9c0 \ubcf4\uace0",
    "\uc790\uaca9\uc815\uc9c0",
    "\uc778\ub2c8 \uc120\uc6d0",
    "\uc778\uc2e0\ub9e4\ub9e4 \ud53c\ud574\uc790",
    "\ubd80\uc0b0 \ubaa8\ud154 \ucd94\ub77d",
    "\ube44\ub2d0\uc9d1",
    "\uc8fc\ubbfc\uc138",
    "[\ud604\uc7a5]",
    "\uc9c0\ubc29 \uc815\ubd80, \ub2eb\ud78c \ud68c\uc758",
    "[\uc65c\ub0d0\uba74]",
    "\uc801\uadf9\ud589\uc815",
    "\uc131\ubd81",
    "\ud589\uc548\ubd80 \uc7a5\uad00\uc0c1",
    "\ubc29\ubb38\uc9c4 \uc0c8 \uc774\uc0ac\uc7a5",
    "MBC 24\uc77c\ubd80\ud130 \uc0ac\uc7a5\ud6c4\ubcf4",
    "\ub178\ub3d9\uc7a5\uad00 \"\uc8fc 52\uc2dc\uac04 \uc608\uc678 \uc5c6\uc5b4\ub3c4 \ubc18\ub3c4\uccb4",
    "\ucc9c\ubb38\ud559\uc801 \uc131\uacfc",
    "\uc608\uc1a1 \ub17c\uc7c1",
    "\ud55c\uc218\uc6d0",
    "\ud3ed\ud589 \ubd80\uc7a5\uac80\uc0ac",
]


NON_CENTRAL_POLITICS_TITLE_RULES = [
    ("\uc815\ubd80", "\uc778\ub2c8 \uc120\uc6d0"),
    ("\uc815\ubd80", "\uc778\uc2e0\ub9e4\ub9e4"),
    ("\uc815\ubd80", "\ube44\ub2d0\uc9d1"),
    ("\uc815\ubd80", "\uc8fc\ubbfc\uc138"),
    ("\uc9c0\ubc29 \uc815\ubd80", "\ud68c\uc758"),
    ("\ud589\uc548\ubd80", "\uc7a5\uad00\uc0c1"),
    ("\ub178\ub3d9\uc7a5\uad00", "\ubc18\ub3c4\uccb4"),
    ("\u6aa2", "\ud55c\uc218\uc6d0"),
]


def is_non_central_politics_title(title: str) -> bool:
    if any(word in title for word in NON_CENTRAL_POLITICS_TITLE_KEYWORDS):
        return True
    return any(all(word in title for word in rule) for rule in NON_CENTRAL_POLITICS_TITLE_RULES)


def is_political(title: str) -> bool:
    compact = title.replace(" ", "")
    external_decision = external_politics_decision(title)
    if external_decision is not None:
        return external_decision

    if any(word in title for word in EXCLUDE_TITLE_KEYWORDS):
        return False

    if is_non_central_politics_title(title):
        return False

    if any(word in title for word in FORCE_INCLUDE_TITLE_KEYWORDS):
        return True

    if any(word in title for word in FOREIGN_POLITICS_HINTS):
        if not any(word in title for word in DOMESTIC_CENTRAL_HINTS):
            return False

    if is_major_political_interview(title):
        return True

    if is_exclusive(title) and has_central_political_context(title):
        return True

    if any(word in title for word in LEGAL_CASE_HINTS):
        if not any(word in title for word in LEGAL_POLITICAL_CONTEXT_HINTS):
            return False

    if any(word in compact for word in LOCAL_POLITICS_HINTS):
        if not any(word in compact for word in ["대통령", "정부", "국회", "정당", "민주당", "국민의힘", "국힘"]):
            return False

    if any(word in title for word in POLITICIAN_HINTS):
        return True

    if any(word in title for word in POLITICS_KEYWORDS):
        return True

    return (
        any(word in title for word in CONTEXTUAL_POLITICS_KEYWORDS)
        and any(word in title for word in POLITICAL_CONTEXT_HINTS)
    )


def render(date: dt.date, grouped: dict[str, list[Article]]) -> str:
    lines: list[str] = [f"#{date:%m%d} 조간정리", ""]

    for full_name, short_name, _press_id in PRESS_ORDER:
        lines.append(f"<{short_name}>")
        lines.append("")

        for article in grouped.get(full_name, []):
            lines.append(article.title)
            if should_show_link(article.title):
                lines.append("")
                lines.append(article.url)
            lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def render_web_json(date: dt.date, grouped: dict[str, list[Article]]) -> str:
    sections: dict[str, list[dict[str, str | bool]]] = {}
    for full_name, short_name, _press_id in PRESS_ORDER:
        sections[short_name] = [
            {
                "title": article.title,
                "url": article.url,
                "showUrl": should_show_link(article.title),
            }
            for article in grouped.get(full_name, [])
        ]

    return json.dumps(
        {"date": f"{date:%Y%m%d}", "sections": sections},
        ensure_ascii=False,
        indent=2,
    ) + "\n"


def collect(yyyymmdd: str, include_all: bool = False, pause: float = 0.25) -> dict[str, list[Article]]:
    grouped: dict[str, list[Article]] = {}
    for full_name, _short_name, press_id in PRESS_ORDER:
        articles = extract_newspaper_articles(press_id, yyyymmdd)
        grouped[full_name] = articles if include_all else [a for a in articles if is_political(a.title)]
        time.sleep(pause)
    return grouped


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="네이버 지면보기 조간 정치기사 스크랩")
    parser.add_argument("--date", help="수집 날짜 YYYYMMDD. 기본값은 Asia/Seoul 기준 오늘")
    parser.add_argument("--all", action="store_true", help="정치 필터 없이 지면 기사 전체 출력")
    parser.add_argument("--output", help="결과 저장 경로. 생략하면 화면에 출력")
    parser.add_argument("--json-output", help="웹페이지용 JSON 저장 경로. 모든 표시 기사 URL을 포함")
    return parser.parse_args(list(argv))


def main(argv: Iterable[str] = sys.argv[1:]) -> int:
    args = parse_args(argv)
    today = dt.datetime.now(ZoneInfo("Asia/Seoul")).date()
    target_date = dt.datetime.strptime(args.date, "%Y%m%d").date() if args.date else today
    yyyymmdd = f"{target_date:%Y%m%d}"

    try:
        grouped = collect(yyyymmdd, include_all=args.all)
    except (HTTPError, URLError, TimeoutError) as exc:
        print(f"수집 실패: {exc}", file=sys.stderr)
        return 1

    result = render(target_date, grouped)
    if args.output:
        with open(args.output, "w", encoding="utf-8", newline="\n") as file:
            file.write(result)
    else:
        print(result, end="")
    if args.json_output:
        with open(args.json_output, "w", encoding="utf-8", newline="\n") as file:
            file.write(render_web_json(target_date, grouped))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
