.PHONY: check verify social-preview check-social-preview install uninstall translations check-translations

check:
	cjs tests/check-source.js applet.js usage-format.js
	cjs tests/test-usage-format.js
	cjs tests/test-spark-disclosure.js
	cjs tests/test-action-centering.js
	cjs tests/test-popup-width.js
	cjs tests/test-install-help.js
	cjs tests/test-plan-pill.js
	cjs tests/test-credits-baseline.js
	cjs tests/test-panel-colors.js
	cjs tests/test-model-visibility.js
	cjs tests/test-notification-delivery.js
	cjs tests/test-settings-schema.js
	python3 -m unittest discover -s tests -p 'test*.py'
	$(MAKE) check-translations
	python3 -m json.tool metadata.json >/dev/null
	python3 -m json.tool settings-schema.json >/dev/null
	python3 tests/check-png.py icon.png icons/usage-white.png
	python3 scripts/render-icons.py --check
	shellcheck install.sh uninstall.sh
	$(MAKE) check-social-preview

verify:
	git diff --check
	$(MAKE) check

social-preview:
	python3 .github/social-preview-src/render-all.py

check-social-preview:
	python3 .github/social-preview-src/render-all.py --check

install:
	./install.sh

uninstall:
	./uninstall.sh

translations:
	python3 scripts/update-translations.py

check-translations:
	python3 scripts/update-translations.py --check
