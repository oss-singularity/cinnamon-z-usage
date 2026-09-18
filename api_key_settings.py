#!/usr/bin/python3
"""API key entry that keeps keyboard focus on clicks outside the field.

Native xlet settings entries keep keyboard focus when the click lands on
a non-focusable area (labels, empty space), and this widget deliberately
keeps that behavior: text fields must not lose focus to outside clicks
(Claudiu's explicit requirement). The class stays registered so the
settings schema can reference it, but it adds no custom event handling.
"""

from JsonSettingsWidgets import JSONSettingsEntry


class ApiKeyEntryWidget(JSONSettingsEntry):
    def __init__(self, info, key, settings):
        JSONSettingsEntry.__init__(self, key, settings, info)
