import pytest
from datetime import date


class FakeMeiliIndex:
    def __init__(self):
        self.added, self.deleted, self.settings = [], [], None

    def add_documents(self, docs, primary_key=None):
        self.added.extend(docs)
        return {"taskUid": 100 + len(self.added)}

    def delete_documents(self, ids=None, *, filter=None, metadata=None):
        self.deleted.append(filter)
        return {"taskUid": len(self.deleted)}

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
    doc_id = document_id(1984, "art-5-bis", "a462e6ee9c1d", 946684800, 0)
    assert re.fullmatch(r"[a-zA-Z0-9_-]+", doc_id), doc_id
    assert doc_id == "1984_art-5-bis_a462e6ee_946684800_0"


def test_document_id_rejects_an_illegal_slug():
    from loader.index_meili import document_id
    with pytest.raises(ValueError, match="not Meilisearch-legal"):
        document_id(1, "art:1", "abcdef12", 0, 0)


def test_document_id_is_span_scoped():
    """An article reverted to an earlier body has ONE articulo row and TWO
    disjoint spans. Without desde_ts in the key they collide, and the later
    span silently overwrites the earlier one."""
    from loader.index_meili import document_id
    a = document_id(4, "art-1", "a462e6ee", 946684800, 0)     # in force 2000-2004
    b = document_id(4, "art-1", "a462e6ee", 1262304000, 0)    # same body, 2010-
    assert a != b

    # articulo_span's PK is (articulo_id, desde, ord): the schema deliberately
    # admits the same body at two positions within ONE version. Same desde,
    # different ord, so the id must differ too.
    c = document_id(4, "art-1", "a462e6ee", 946684800, 1)
    assert a != c


def test_sync_articulos_returns_enqueued_tasks():
    from loader.index_meili import sync_articulos
    idx = FakeMeiliIndex()
    idx.add_documents = lambda docs, primary_key=None: {"taskUid": 7}
    idx.delete_documents = lambda ids=None, *, filter=None, metadata=None: {"taskUid": 6}
    tasks = sync_articulos(idx, [{"id": "1_art-1_abc_0"}], [1])
    assert [t["taskUid"] for t in tasks] == [6, 7]


def test_wait_for_tasks_raises_on_a_failed_task():
    """add_documents is async: a rejected batch fails the TASK, not the call."""
    from loader.index_meili import wait_for_tasks

    class FakeClient:
        def wait_for_task(self, uid, timeout_in_ms=None):
            return {"status": "failed", "error": {"code": "invalid_document_id"}}

    with pytest.raises(RuntimeError, match="invalid_document_id"):
        wait_for_tasks(FakeClient(), [{"taskUid": 7}])


def test_wait_for_tasks_accepts_a_succeeded_task():
    from loader.index_meili import wait_for_tasks

    class FakeClient:
        def wait_for_task(self, uid, timeout_in_ms=None):
            return {"status": "succeeded"}

    wait_for_tasks(FakeClient(), [{"taskUid": 7}])


def test_fake_client_mirrors_the_real_meilisearch_api():
    """The fake must not invent methods the real client lacks.

    sync_articulos originally called index.delete_documents_by_filter(), which
    has never existed in the Python client — and the fake defined a method with
    that same wrong name, so every test passed while the real call would raise
    AttributeError. Pin the surface we actually use.
    """
    import inspect
    meilisearch = pytest.importorskip("meilisearch")
    from meilisearch.client import Client
    from meilisearch.index import Index

    for name in ("add_documents", "delete_documents", "update_settings"):
        assert hasattr(Index, name), f"real Index lacks {name}"
    assert not hasattr(Index, "delete_documents_by_filter"), "this method does not exist"

    assert "filter" in inspect.signature(Index.delete_documents).parameters
    assert "timeout_in_ms" in inspect.signature(Client.wait_for_task).parameters

    for name in ("add_documents", "delete_documents", "update_settings"):
        assert hasattr(FakeMeiliIndex, name), f"fake lacks {name}"


def test_wait_for_tasks_reads_attribute_style_tasks():
    """The real client returns pydantic models, not dicts."""
    from loader.index_meili import wait_for_tasks

    class TaskInfo:
        task_uid = 7

    class Task:
        status = "failed"
        error = {"code": "invalid_document_id"}

    class FakeClient:
        def wait_for_task(self, uid, timeout_in_ms=None):
            assert uid == 7
            return Task()

    with pytest.raises(RuntimeError, match="invalid_document_id"):
        wait_for_tasks(FakeClient(), [TaskInfo()])


def test_wait_for_tasks_raises_on_a_canceled_task():
    from loader.index_meili import wait_for_tasks

    class FakeClient:
        def wait_for_task(self, uid, timeout_in_ms=None):
            return {"status": "canceled", "error": None}

    with pytest.raises(RuntimeError, match="canceled"):
        wait_for_tasks(FakeClient(), [{"taskUid": 1}])


def test_wait_for_tasks_passes_a_generous_timeout():
    """The client default is 5s; a bulk add_documents exceeds it routinely."""
    from loader.index_meili import TASK_TIMEOUT_MS, wait_for_tasks
    seen = {}

    class FakeClient:
        def wait_for_task(self, uid, timeout_in_ms=None):
            seen["timeout"] = timeout_in_ms
            return {"status": "succeeded"}

    wait_for_tasks(FakeClient(), [{"taskUid": 1}])
    assert seen["timeout"] == TASK_TIMEOUT_MS >= 60_000

