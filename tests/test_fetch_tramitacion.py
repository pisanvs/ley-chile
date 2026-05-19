"""Tests for fetch_tramitacion.py — pure functions only (no network calls)."""

import importlib
import sys

import pytest

# Import via importlib to avoid triggering any module-level side-effects that differ
# between environments. The script has no module-level network calls.
import fetch_tramitacion as ft


# ---------------------------------------------------------------------------
# _parse_date_dmy
# ---------------------------------------------------------------------------

class TestParseDateDmy:
    def test_standard(self):
        assert ft._parse_date_dmy("16/02/2005") == "2005-02-16"

    def test_single_digit_day_month(self):
        assert ft._parse_date_dmy("1/3/2020") == "2020-03-01"

    def test_empty_string(self):
        assert ft._parse_date_dmy("") is None

    def test_wrong_format(self):
        assert ft._parse_date_dmy("2005-02-16") is None

    def test_non_numeric(self):
        assert ft._parse_date_dmy("dd/mm/yyyy") is None

    def test_too_few_parts(self):
        assert ft._parse_date_dmy("16/02") is None

    def test_whitespace_stripped(self):
        assert ft._parse_date_dmy("  01/01/2000  ") == "2000-01-01"


# ---------------------------------------------------------------------------
# _ley_numero_to_int
# ---------------------------------------------------------------------------

class TestLeyNumeroToInt:
    def test_plain_number(self):
        assert ft._ley_numero_to_int("20000") == 20000

    def test_with_ley_prefix(self):
        assert ft._ley_numero_to_int("Ley 20.000") == 20000

    def test_with_nro_prefix(self):
        assert ft._ley_numero_to_int("Ley Nº 20.000") == 20000

    def test_with_degree_sign(self):
        assert ft._ley_numero_to_int("Ley N° 19.366") == 19366

    def test_uppercase_ley(self):
        assert ft._ley_numero_to_int("LEY 21575") == 21575

    def test_no_thousands_separator(self):
        assert ft._ley_numero_to_int("Ley 18403") == 18403

    def test_empty_string(self):
        assert ft._ley_numero_to_int("") is None

    def test_non_numeric(self):
        assert ft._ley_numero_to_int("Ley abc") is None

    def test_commas_removed(self):
        # Some sources use commas as thousands separators
        assert ft._ley_numero_to_int("20,000") == 20000


# ---------------------------------------------------------------------------
# _year_to_boletin_range
# ---------------------------------------------------------------------------

class TestYearToBoletinRange:
    def test_year_in_first_range(self):
        lo, hi = ft._year_to_boletin_range(1992)
        assert lo == 800
        assert hi == 1800

    def test_year_in_middle_range(self):
        lo, hi = ft._year_to_boletin_range(2003)
        assert lo == 2600
        assert hi == 3600

    def test_year_after_2024(self):
        lo, hi = ft._year_to_boletin_range(2025)
        assert lo == 17000
        assert hi == 20000

    def test_year_before_1990(self):
        lo, hi = ft._year_to_boletin_range(1985)
        assert lo == 0
        assert hi == 0

    def test_year_boundary_inclusive(self):
        # 2016 is the start of the (2016, 2020, 9500, 13000) range
        lo, hi = ft._year_to_boletin_range(2016)
        assert lo == 9500
        assert hi == 13000

    def test_year_2020_boundary(self):
        # 2020 is the end of the (2016, 2020, 9500, 13000) range
        lo, hi = ft._year_to_boletin_range(2020)
        assert lo == 9500
        assert hi == 13000
