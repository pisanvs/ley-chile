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
