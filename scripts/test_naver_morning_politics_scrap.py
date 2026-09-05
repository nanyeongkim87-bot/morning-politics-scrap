import unittest
from unittest import mock
from urllib.error import URLError

from outputs import naver_morning_politics_scrap as scraper


class PartialSourceCollectionTests(unittest.TestCase):
    @staticmethod
    def fake_extract(press_id: str, _yyyymmdd: str) -> list[scraper.Article]:
        if press_id == "025":
            raise URLError("temporary source failure")
        if press_id == "023":
            return [
                scraper.Article(f"대통령 국회 기사 {index}", f"https://example.test/{index}")
                for index in range(5)
            ]
        return []

    def test_saturday_partial_close_isolates_one_source_failure(self) -> None:
        with mock.patch.object(scraper, "extract_newspaper_articles", side_effect=self.fake_extract):
            grouped = scraper.collect("20260905", allow_partial_sources=True, pause=0)

        self.assertEqual(len(grouped["조선일보"]), 5)
        self.assertEqual(grouped["중앙일보"], [])

    def test_strict_close_fails_when_any_source_request_fails(self) -> None:
        with mock.patch.object(scraper, "extract_newspaper_articles", side_effect=self.fake_extract):
            with self.assertRaisesRegex(RuntimeError, "중앙일보"):
                scraper.collect("20260905", allow_partial_sources=False, pause=0)


if __name__ == "__main__":
    unittest.main()
