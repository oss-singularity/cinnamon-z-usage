#!/usr/bin/python3
"""API key entry that blurs on clicks outside the field.

Native xlet settings entries keep keyboard focus when the click lands on
a non-focusable area (labels, empty space). This widget captures window
presses before the entry consumes them and releases focus when the press
lands outside the entry, matching normal desktop text field behavior.
"""

from gi.repository import Gtk

from JsonSettingsWidgets import JSONSettingsEntry


class ApiKeyEntryWidget(JSONSettingsEntry):
    def __init__(self, info, key, settings):
        JSONSettingsEntry.__init__(self, key, settings, info)
        self._closed = False
        self._click_gesture = None
        self._click_handler = 0
        self.connect("hierarchy-changed", self._hierarchy_changed)
        self.connect("destroy", self._on_destroy)

    def _hierarchy_changed(self, *_args):
        self._disconnect_click_gesture()
        window = self.get_toplevel()
        if self._closed or not isinstance(window, Gtk.Window):
            return
        # Capture before the entry consumes clicks, including presses on
        # non-focusable labels and empty areas. The event stays available
        # to its normal target.
        self._click_gesture = Gtk.GestureMultiPress.new(window)
        self._click_gesture.set_button(0)
        self._click_gesture.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
        self._click_handler = self._click_gesture.connect("pressed", self._window_pressed)

    def _window_pressed(self, gesture, _count, x, y):
        window = gesture.get_widget()
        entry = window.get_focus()
        if self._closed or entry is not self.content_widget:
            return
        position = self.content_widget.translate_coordinates(window, 0, 0)
        if position is None:
            return
        left, top = position
        if not (
            left <= x < left + self.content_widget.get_allocated_width()
            and top <= y < top + self.content_widget.get_allocated_height()
        ):
            window.set_focus(None)

    def _disconnect_click_gesture(self):
        if self._click_gesture is not None:
            if self._click_handler:
                self._click_gesture.disconnect(self._click_handler)
            self._click_gesture = None
        self._click_handler = 0

    def _on_destroy(self, *_args):
        self._closed = True
        self._disconnect_click_gesture()
