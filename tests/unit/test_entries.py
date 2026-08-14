"""命名规则与 slug 生成。"""

from __future__ import annotations

import pytest

from fp_share_app.application.entries import (
    NameValidationError,
    generate_slug,
    parse_name,
)


def test_parse_name_valid():
    assert parse_name("DataDome-radwell.com") == ("DataDome", "radwell.com")
    assert parse_name("瑞数6-某站") == ("瑞数6", "某站")


def test_parse_name_requires_dash():
    with pytest.raises(NameValidationError, match="风控类型-网站"):
        parse_name("NoDashHere")
    with pytest.raises(NameValidationError, match="两段均不能为空"):
        parse_name("-radwell.com")
    with pytest.raises(NameValidationError, match="两段均不能为空"):
        parse_name("DataDome-")


def test_parse_name_rejects_illegal_chars():
    for bad in ["a b", "x;y-z", "name</script>-x", "瑞数6<某-站"]:
        with pytest.raises(NameValidationError, match="非法字符"):
            parse_name(bad)


def test_generate_slug():
    assert generate_slug("DataDome-radwell.com") == "datadome-radwell.com"
    assert generate_slug("AKAMAI 2-x") == "akamai-2-x"
    assert generate_slug("瑞数6-某站") == ""
