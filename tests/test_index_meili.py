import pytest
from datetime import date


class FakeMeiliIndex:
    def __init__(self):
        self.added, self.deleted, self.settings = [], [], None

    def add_documents(self, docs, primary_key=None):
        self.added.extend(docs)

    def delete_documents_by_filter(self, filter):
        self.deleted.append(filter)

    def update_settings(self, settings):
        self.settings = settings


def test_open_ended_sentinel():
    from loader.index_meili import OPEN_ENDED_TS, to_ts
    assert to_ts(None) == OPEN_ENDED_TS
    assert OPEN_ENDED_TS == 253402300799


def test_to_ts_is_utc_midnight():
    from loader.index_meili import to_ts
    assert to_ts(date(1970, 1, 1)) == 0
    assert to_ts(date(2000, 1, 1)) == 946684800


def test_rank_tipo_puts_ley_above_res():
    from loader.index_meili import rank_tipo
    assert rank_tipo("ley") < rank_tipo("dto") < rank_tipo("res")
    assert rank_tipo("desconocido") == rank_tipo("res")


def test_settings_do_not_set_index_level_distinct():
    """Index-level distinct would break 'all matching artículos inside this law'."""
    from loader.index_meili import SETTINGS
    assert "distinctAttribute" not in SETTINGS
    assert "id_norma" in SETTINGS["filterableAttributes"]
    assert SETTINGS["searchableAttributes"] == ["titulo", "label", "body"]
    assert "desde_ts" in SETTINGS["filterableAttributes"]
    assert "hasta_ts" in SETTINGS["filterableAttributes"]


def test_sync_deletes_before_adding():
    from loader.index_meili import sync_articulos
    idx = FakeMeiliIndex()
    sync_articulos(idx, [{"id": "1:art-1:abc", "id_norma": 1}], [1, 2])
    assert idx.deleted == ["id_norma IN [1, 2]"]
    assert len(idx.added) == 1


def test_sync_with_no_deletes_skips_the_delete_call():
    from loader.index_meili import sync_articulos
    idx = FakeMeiliIndex()
    sync_articulos(idx, [{"id": "1:art-1:abc"}], [])
    assert idx.deleted == []


def test_document_id_is_meilisearch_legal():
    """Meilisearch ids admit only [a-zA-Z0-9_-]. A colon fails the whole batch."""
    import re
    from loader.index_meili import document_id
    doc_id = document_id(1984, "art-5-bis", "a462e6ee9c1d", 946684800)
    assert re.fullmatch(r"[a-zA-Z0-9_-]+", doc_id), doc_id
    assert doc_id == "1984_art-5-bis_a462e6ee_946684800"


def test_document_id_rejects_an_illegal_slug():
    from loader.index_meili import document_id
    with pytest.raises(ValueError, match="not Meilisearch-legal"):
        document_id(1, "art:1", "abcdef12", 0)


def test_document_id_is_span_scoped():
    """An article reverted to an earlier body has ONE articulo row and TWO
    disjoint spans. Without desde_ts in the key they collide, and the later
    span silently overwrites the earlier one."""
    from loader.index_meili import document_id
    a = document_id(4, "art-1", "a462e6ee", 946684800)     # in force 2000-2004
    b = document_id(4, "art-1", "a462e6ee", 1262304000)    # same body, 2010-
    assert a != b


def test_sync_articulos_returns_enqueued_tasks():
    from loader.index_meili import sync_articulos
    idx = FakeMeiliIndex()
    idx.add_documents = lambda docs, primary_key=None: {"taskUid": 7}
    idx.delete_documents_by_filter = lambda filter: {"taskUid": 6}
    tasks = sync_articulos(idx, [{"id": "1_art-1_abc_0"}], [1])
    assert [t["taskUid"] for t in tasks] == [6, 7]


def test_wait_for_tasks_raises_on_a_failed_task():
    """add_documents is async: a rejected batch fails the TASK, not the call."""
    from loader.index_meili import wait_for_tasks

    class FakeClient:
        def wait_for_task(self, uid):
            return {"status": "failed", "error": {"code": "invalid_document_id"}}

    with pytest.raises(RuntimeError, match="invalid_document_id"):
        wait_for_tasks(FakeClient(), [{"taskUid": 7}])


def test_wait_for_tasks_accepts_a_succeeded_task():
    from loader.index_meili import wait_for_tasks

    class FakeClient:
        def wait_for_task(self, uid):
            return {"status": "succeeded"}

    wait_for_tasks(FakeClient(), [{"taskUid": 7}])

