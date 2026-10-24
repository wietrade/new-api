package middleware

import "testing"

func TestIsFrontendDocument(t *testing.T) {
	cases := map[string]bool{
		"/":                            true,
		"/pricing":                     true,
		"/dashboard/token":             true,
		"/docs":                        true,
		"/docs/":                       true,
		"/docs/guide/quick-start.html": true,
		"/docs/privacy.html":           true,
		"/static/js/index.abc123.js":   false,
		"/docs/assets/app.abc.css":     false,
		"/docs/assets/inter.woff2":     false,
		"/sitemap.xml":                 false,
		"/api/status":                  false,
		"/v1/models":                   false,
		"/pg/health":                   false,
	}
	for path, want := range cases {
		if got := isFrontendDocument(path); got != want {
			t.Errorf("isFrontendDocument(%q) = %v, want %v", path, got, want)
		}
	}
}

func TestIsImmutableAsset(t *testing.T) {
	cases := map[string]bool{
		"/static/js/index.abc123.js": true,
		"/docs/assets/app.abc.css":   true,
		"/docs/privacy.html":         false,
		"/pricing":                   false,
	}
	for path, want := range cases {
		if got := isImmutableAsset(path); got != want {
			t.Errorf("isImmutableAsset(%q) = %v, want %v", path, got, want)
		}
	}
}
