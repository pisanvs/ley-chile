"""Tests for rebuild_history.py — pure functions only (no git or network calls)."""

import datetime
from pathlib import Path

import pytest

import rebuild_history as rh
from rebuild_history import Event


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_event(
    date: str = "2005-02-16",
    tipo: str = "feat",
    scope: str = "ley",
    ley_numero: str = "20000",
    version_date: str = "2005-02-16",
    modifier_numero: str = "",
    seq: int = 0,
) -> Event:
    return Event(
        date=date,
        tipo=tipo,
        scope=scope,
        ley_numero=ley_numero,
        version_date=version_date,
        law_dir=f"leyes/{ley_numero}",
        message_subject=f"{tipo}({scope}): Ley {ley_numero}",
        message_body="",
        files={},
        modifier_numero=modifier_numero,
        _seq=seq,
    )


# ---------------------------------------------------------------------------
# Event.sort_key
# ---------------------------------------------------------------------------

class TestEventSortKey:
    def test_feat_rank_zero(self):
        e = _make_event(tipo="feat")
        _, _, rank, _ = e.sort_key()
        assert rank == 0

    def test_update_with_modifier_rank_one(self):
        e = _make_event(tipo="update", modifier_numero="20502")
        _, _, rank, _ = e.sort_key()
        assert rank == 1

    def test_derog_rank_two(self):
        e = _make_event(tipo="derog", modifier_numero="20502")
        _, _, rank, _ = e.sort_key()
        assert rank == 2

    def test_feat_no_modifier_uses_own_ley_numero(self):
        e = _make_event(tipo="feat", ley_numero="20000", modifier_numero="")
        _, group, _, _ = e.sort_key()
        assert group == "20000"

    def test_update_with_modifier_uses_modifier_numero(self):
        e = _make_event(tipo="update", ley_numero="20000", modifier_numero="20502")
        _, group, _, _ = e.sort_key()
        assert group == "20502"

    def test_sort_ordering(self):
        # On the same date, feat < update < derog for the same modifier
        feat = _make_event("2005-02-16", "feat", modifier_numero="")
        upd = _make_event("2005-02-16", "update", modifier_numero="20502", seq=1)
        derog = _make_event("2005-02-16", "derog", modifier_numero="20502", seq=2)
        assert feat.sort_key() < upd.sort_key()
        assert upd.sort_key() < derog.sort_key()


# ---------------------------------------------------------------------------
# _event_group_key
# ---------------------------------------------------------------------------

class TestEventGroupKey:
    def test_law_events_group_by_date_and_trigger(self):
        e1 = _make_event("2005-02-16", "feat", ley_numero="20000", modifier_numero="")
        e2 = _make_event("2005-02-16", "update", ley_numero="19366", modifier_numero="20000")
        # Both triggered by same norma (20000) on same date → same group key
        assert rh._event_group_key(e1) == rh._event_group_key(e2)

    def test_different_dates_different_key(self):
        e1 = _make_event("2005-02-16", "feat")
        e2 = _make_event("2006-01-01", "feat")
        assert rh._event_group_key(e1) != rh._event_group_key(e2)

    def test_chore_uses_unique_key_per_event(self):
        e1 = _make_event("2005-02-16", "chore", seq=1)
        e2 = _make_event("2005-02-16", "chore", seq=2)
        e1.tipo = "chore"
        e2.tipo = "chore"
        assert rh._event_group_key(e1) != rh._event_group_key(e2)


# ---------------------------------------------------------------------------
# _group_events
# ---------------------------------------------------------------------------

class TestGroupEvents:
    def test_same_key_grouped(self):
        e1 = _make_event("2005-02-16", "feat", ley_numero="20000", seq=0)
        e2 = _make_event("2005-02-16", "update", ley_numero="19366", modifier_numero="20000", seq=1)
        groups = rh._group_events([e1, e2])
        assert len(groups) == 1
        assert len(groups[0]) == 2

    def test_different_dates_separate_groups(self):
        e1 = _make_event("2005-02-16", "feat")
        e2 = _make_event("2011-02-21", "update")
        groups = rh._group_events([e1, e2])
        assert len(groups) == 2

    def test_non_contiguous_not_grouped(self):
        # Even if same key, non-contiguous events after sorting → separate groups
        e1 = _make_event("2005-02-16", "feat", ley_numero="20000", seq=0)
        e_other = _make_event("2005-02-16", "chore", ley_numero="X", seq=1)
        e_other.tipo = "chore"
        e2 = _make_event("2005-02-16", "update", ley_numero="20000", seq=2)
        groups = rh._group_events([e1, e_other, e2])
        assert len(groups) == 3

    def test_empty_input(self):
        assert rh._group_events([]) == []

    def test_single_event(self):
        e = _make_event()
        groups = rh._group_events([e])
        assert len(groups) == 1
        assert groups[0] == [e]


# ---------------------------------------------------------------------------
# _merge_commit_body
# ---------------------------------------------------------------------------

class TestMergeCommitBody:
    def test_single_event_returns_body(self):
        e = _make_event()
        e.message_body = "BCN idNorma=235507"
        assert rh._merge_commit_body([e]) == "BCN idNorma=235507"

    def test_modifies_listed(self):
        primary = _make_event("2005-02-16", "feat", ley_numero="20000")
        primary.message_body = "BCN idNorma=235507"
        upd = _make_event("2005-02-16", "update", ley_numero="19366", modifier_numero="20000")
        body = rh._merge_commit_body([primary, upd])
        assert "Modifica: Ley 19366" in body

    def test_derogates_listed(self):
        primary = _make_event("2005-02-16", "feat", ley_numero="20000")
        primary.message_body = "BCN idNorma=235507"
        derog = _make_event("2005-02-16", "derog", ley_numero="19366", modifier_numero="20000")
        body = rh._merge_commit_body([primary, derog])
        assert "Deroga: Ley 19366" in body

    def test_modified_excluded_from_modifies_if_also_derogated(self):
        primary = _make_event("2005-02-16", "feat", ley_numero="20000")
        primary.message_body = ""
        upd = _make_event("2005-02-16", "update", ley_numero="19366", modifier_numero="20000")
        derog = _make_event("2005-02-16", "derog", ley_numero="19366", modifier_numero="20000")
        body = rh._merge_commit_body([primary, upd, derog])
        # 19366 is in derogated → removed from modified list
        assert "Deroga: Ley 19366" in body
        assert "Modifica: Ley 19366" not in body

    def test_empty_body_with_extra_events(self):
        primary = _make_event("2005-02-16", "feat", ley_numero="20000")
        primary.message_body = ""
        upd = _make_event("2005-02-16", "update", ley_numero="19366", modifier_numero="20000")
        body = rh._merge_commit_body([primary, upd])
        # primary body empty, should still produce summary
        assert "Modifica:" in body


# ---------------------------------------------------------------------------
# _build_session_body
# ---------------------------------------------------------------------------

class TestBuildSessionBody:
    def _tram(self, tramitacion=None, votaciones=None, boletin="3182-07") -> dict:
        return {
            "boletin": boletin,
            "tramitacion": tramitacion or [],
            "votaciones_camara": votaciones or [],
        }

    def test_none_returns_empty(self):
        assert rh._build_session_body(None, "2005-02-16") == ""

    def test_boletin_included(self):
        body = rh._build_session_body(self._tram(), "2005-02-16")
        assert "Boletín: 3182-07" in body

    def test_vote_line_included(self):
        votaciones = [
            {"fecha": "2004-12-15", "afirmativos": 67, "negativos": 12,
             "abstenciones": 3, "resultado": "Aprobado", "tramite": "TERCER TRÁMITE"},
        ]
        body = rh._build_session_body(self._tram(votaciones=votaciones), "2005-02-16")
        assert "67 a favor" in body
        assert "12 en contra" in body
        assert "3 abstenciones" in body
        assert "Aprobado" in body

    def test_tramite_step_included(self):
        tram = [
            {"fecha": "2004-12-15", "etapa": "Tercer trámite", "camara": "Senado",
             "sesion": "47", "descripcion": ""},
        ]
        body = rh._build_session_body(self._tram(tramitacion=tram), "2005-02-16")
        assert "Trámite:" in body
        assert "Senado" in body

    def test_feat_uses_approval_tramite(self):
        tram = [
            {"fecha": "2001-07-19", "etapa": "Ingreso", "camara": "Senado",
             "sesion": "1", "descripcion": ""},
            {"fecha": "2004-12-15", "etapa": "Promulgación", "camara": "Senado",
             "sesion": "47", "descripcion": "promulg"},
        ]
        body = rh._build_session_body(self._tram(tramitacion=tram), "2005-02-16", is_feat=True)
        # For feat, we expect the promulgation step
        assert "Promulgación" in body or "promulg" in body


# ---------------------------------------------------------------------------
# _find_closest_tramite
# ---------------------------------------------------------------------------

class TestFindClosestTramite:
    def test_finds_closest_before_target(self):
        steps = [
            {"fecha": "2001-07-19", "etapa": "Ingreso"},
            {"fecha": "2003-05-10", "etapa": "Segundo trámite"},
            {"fecha": "2004-12-15", "etapa": "Promulgación"},
        ]
        result = rh._find_closest_tramite(steps, "2003-06-01")
        assert result["fecha"] == "2003-05-10"

    def test_returns_last_if_all_after_target(self):
        steps = [
            {"fecha": "2010-01-01", "etapa": "Ingreso"},
        ]
        result = rh._find_closest_tramite(steps, "2005-01-01")
        assert result["etapa"] == "Ingreso"

    def test_empty_list_returns_none(self):
        assert rh._find_closest_tramite([], "2005-01-01") is None

    def test_exact_date_match(self):
        steps = [{"fecha": "2005-02-16", "etapa": "Promulgación"}]
        result = rh._find_closest_tramite(steps, "2005-02-16")
        assert result["fecha"] == "2005-02-16"


# ---------------------------------------------------------------------------
# _find_approval_tramite
# ---------------------------------------------------------------------------

class TestFindApprovalTramite:
    def test_finds_promulgacion(self):
        steps = [
            {"fecha": "2001-07-19", "etapa": "Ingreso", "descripcion": ""},
            {"fecha": "2004-12-15", "etapa": "Promulgación", "descripcion": "promulg definitiva"},
        ]
        result = rh._find_approval_tramite(steps)
        assert "promulg" in result.get("descripcion", "") or "promulg" in result.get("etapa", "").lower()

    def test_falls_back_to_last_step(self):
        steps = [
            {"fecha": "2001-07-19", "etapa": "Ingreso", "descripcion": ""},
            {"fecha": "2002-06-01", "etapa": "Comisión", "descripcion": ""},
        ]
        result = rh._find_approval_tramite(steps)
        assert result["fecha"] == "2002-06-01"

    def test_empty_returns_none(self):
        assert rh._find_approval_tramite([]) is None


# ---------------------------------------------------------------------------
# _find_closest_vote
# ---------------------------------------------------------------------------

class TestFindClosestVote:
    def test_finds_closest_before_target(self):
        votes = [
            {"fecha": "2004-05-01", "resultado": "Aprobado"},
            {"fecha": "2004-12-15", "resultado": "Aprobado en tercer trámite"},
        ]
        result = rh._find_closest_vote(votes, "2004-10-01")
        assert result["fecha"] == "2004-05-01"

    def test_empty_list_returns_none(self):
        assert rh._find_closest_vote([], "2005-01-01") is None

    def test_returns_first_if_all_after_target(self):
        votes = [{"fecha": "2010-01-01", "resultado": "Aprobado"}]
        result = rh._find_closest_vote(votes, "2005-01-01")
        assert result["fecha"] == "2010-01-01"


# ---------------------------------------------------------------------------
# _is_base_commit
# ---------------------------------------------------------------------------

class TestIsBaseCommit:
    def test_known_subject_is_base(self):
        c = {
            "subject": "feat: initial scaffold — README, data access utils, and daily sync",
            "files": ["scripts/trace_graph.py"],
        }
        assert rh._is_base_commit(c) is True

    def test_scripts_only_files_is_base(self):
        c = {
            "subject": "some other message",
            "files": ["scripts/rebuild_history.py", "requirements.txt"],
        }
        assert rh._is_base_commit(c) is True

    def test_law_file_not_base(self):
        c = {
            "subject": "feat(ley): Ley 20000 publicada",
            "files": ["leyes/20000/texto.md"],
        }
        assert rh._is_base_commit(c) is False

    def test_mixed_files_not_base(self):
        c = {
            "subject": "mixed",
            "files": ["scripts/foo.py", "leyes/20000/texto.md"],
        }
        assert rh._is_base_commit(c) is False

    def test_empty_files_not_base(self):
        c = {"subject": "empty", "files": []}
        assert rh._is_base_commit(c) is False


# ---------------------------------------------------------------------------
# _date_to_unix
# ---------------------------------------------------------------------------

class TestDateToUnix:
    def test_known_date(self):
        ts = rh._date_to_unix("2005-02-16")
        # 2005-02-16 noon UTC
        expected = int(datetime.datetime(2005, 2, 16, 12, 0, 0, tzinfo=datetime.timezone.utc).timestamp())
        assert ts == expected

    def test_seq_offset(self):
        ts0 = rh._date_to_unix("2005-02-16", seq=0)
        ts1 = rh._date_to_unix("2005-02-16", seq=1)
        assert ts1 == ts0 + 1

    def test_invalid_date_returns_zero(self):
        assert rh._date_to_unix("not-a-date") == 0
