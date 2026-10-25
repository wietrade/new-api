package model

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// This file pins the metadata pipeline end to end:
//
//	model-data repo (python)  ->  api/*.json  ->  backend vocabularies
//	                                        \->  web constants -> i18n catalog
//
// Any drift used to surface as blank UI columns or silently dropped values.
//
// 模型元数据与价格资料库已于 2026-10-26 拆成独立仓库，默认与本仓库同级
// （../model-data）。设置 MODEL_DATA_DIR 指向该仓库根目录即可继续校验；
// 仓库不在本机时相关断言自动跳过，不影响其余测试。

const (
	webConstantsPath = "../web/src/features/pricing/constants.ts"
	webTypesPath     = "../web/src/features/pricing/types.ts"
	webModelTypes    = "../web/src/features/models/types.ts"
	webDialogPath    = "../web/src/features/models/components/dialogs/sync-wizard-dialog.tsx"
)

var (
	modelDataDir    = resolveModelDataDir()
	pythonNormalize = filepath.Join(modelDataDir, "tools", "model_sync", "normalize.py")
	metadataDir     = filepath.Join(modelDataDir, "api", "newapi")
	metadataI18nDir = filepath.Join(modelDataDir, "api", "i18n")
)

func resolveModelDataDir() string {
	if dir := strings.TrimSpace(os.Getenv("MODEL_DATA_DIR")); dir != "" {
		return dir
	}
	return filepath.Join("..", "model-data")
}

func readOrSkip(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Skipf("source not available (%s): %v", path, err)
	}
	return string(data)
}

func quotedValues(block string) []string {
	re := regexp.MustCompile(`['"]([a-z_]+)['"]`)
	seen := map[string]bool{}
	var values []string
	for _, match := range re.FindAllStringSubmatch(block, -1) {
		if !seen[match[1]] {
			seen[match[1]] = true
			values = append(values, match[1])
		}
	}
	return values
}

func sliceBetween(src, startMarker, endMarker string) string {
	start := strings.Index(src, startMarker)
	if start < 0 {
		return ""
	}
	rest := src[start+len(startMarker):]
	end := strings.Index(rest, endMarker)
	if end < 0 {
		return ""
	}
	return rest[:end]
}

var mappingEntryPattern = regexp.MustCompile(`(?m)^\s*["']([a-z_]+)["']\s*:\s*["']([a-z_]+)["']`)

// mappingValues returns the right-hand side of a python/ts string map, so
// aliases such as "pdf": "file" contribute only the canonical value.
func mappingValues(block string) []string {
	var values []string
	for _, match := range mappingEntryPattern.FindAllStringSubmatch(block, -1) {
		values = append(values, match[2])
	}
	return values
}

func sortedUnique(values []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, v := range values {
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	sort.Strings(out)
	return out
}

func mapKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func TestCapabilityVocabularyMatchesWebAndScript(t *testing.T) {
	goVocab := mapKeys(MetadataCapabilityVocabulary)
	if len(goVocab) == 0 {
		t.Fatal("backend capability vocabulary is empty")
	}

	tsBlock := sliceBetween(readOrSkip(t, webConstantsPath), "MODEL_CAPABILITIES = {", "} as const")
	tsVocab := sortedUnique(quotedValues(tsBlock))

	pyBlock := sliceBetween(readOrSkip(t, pythonNormalize), "CAPABILITY_ORDER = (", ")")
	pyVocab := sortedUnique(quotedValues(pyBlock))

	if strings.Join(goVocab, ",") != strings.Join(tsVocab, ",") {
		t.Errorf("capability vocabulary drift\n backend: %v\n web:     %v", goVocab, tsVocab)
	}
	if strings.Join(goVocab, ",") != strings.Join(pyVocab, ",") {
		t.Errorf("capability vocabulary drift\n backend: %v\n script:  %v", goVocab, pyVocab)
	}
}

func TestModalityVocabularyMatchesWebAndScript(t *testing.T) {
	goVocab := mapKeys(MetadataModalityVocabulary)
	if len(goVocab) == 0 {
		t.Fatal("backend modality vocabulary is empty")
	}

	tsUnion := sliceBetween(readOrSkip(t, webTypesPath), "export type Modality = ", "\n")
	tsVocab := sortedUnique(quotedValues(tsUnion))

	pyBlock := sliceBetween(readOrSkip(t, pythonNormalize), "MODALITY_ALIASES = {", "}")
	pyVocab := sortedUnique(mappingValues(pyBlock))

	if strings.Join(goVocab, ",") != strings.Join(tsVocab, ",") {
		t.Errorf("modality vocabulary drift\n backend: %v\n web:     %v", goVocab, tsVocab)
	}
	if strings.Join(goVocab, ",") != strings.Join(pyVocab, ",") {
		t.Errorf("modality vocabulary drift\n backend: %v\n script:  %v", goVocab, pyVocab)
	}
}

type metadataEnvelope struct {
	Data []map[string]any `json:"data"`
}

func loadMetadata(t *testing.T, path string) metadataEnvelope {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Skipf("metadata not available: %v", err)
	}
	var envelope metadataEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		t.Fatalf("%s: %v", path, err)
	}
	return envelope
}

func TestMetadataCatalogHonoursVocabularies(t *testing.T) {
	models := loadMetadata(t, filepath.Join(metadataDir, "models.json"))
	vendors := loadMetadata(t, filepath.Join(metadataDir, "vendors.json"))

	vendorNames := map[string]bool{}
	for _, vendor := range vendors.Data {
		if name, ok := vendor["name"].(string); ok {
			vendorNames[name] = true
		}
	}

	seen := map[string]bool{}
	for _, entry := range models.Data {
		name, _ := entry["model_name"].(string)
		if name == "" {
			t.Error("model with empty model_name")
			continue
		}
		if seen[name] {
			t.Errorf("duplicate model_name %q", name)
		}
		seen[name] = true

		vendor, _ := entry["vendor_name"].(string)
		if vendor != "" && !vendorNames[vendor] {
			t.Errorf("%s: vendor %q missing from vendors.json", name, vendor)
		}

		for _, capability := range stringList(entry["capabilities"]) {
			if !MetadataCapabilityVocabulary[capability] {
				t.Errorf("%s: unknown capability %q", name, capability)
			}
		}
		for _, field := range []string{"input_modalities", "output_modalities"} {
			for _, modality := range stringList(entry[field]) {
				if !MetadataModalityVocabulary[modality] {
					t.Errorf("%s: unknown %s value %q", name, field, modality)
				}
			}
		}

		contextLength, _ := entry["context_length"].(float64)
		maxOutput, _ := entry["max_output_tokens"].(float64)
		if contextLength > 0 && maxOutput > contextLength {
			t.Errorf("%s: max_output_tokens %v exceeds context_length %v", name, maxOutput, contextLength)
		}
		if status, ok := entry["status"].(float64); ok && status != 0 && status != 1 {
			t.Errorf("%s: invalid status %v", name, status)
		}
		if rule, ok := entry["name_rule"].(float64); ok && (rule < 0 || rule > 3) {
			t.Errorf("%s: invalid name_rule %v", name, rule)
		}
	}
}

func stringList(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		if str, ok := item.(string); ok && str != "" {
			out = append(out, str)
		}
	}
	return out
}

func TestMetadataI18nCopiesMatchCanonical(t *testing.T) {
	for _, file := range []string{"models.json", "vendors.json"} {
		canonical := readOrSkip(t, filepath.Join(metadataDir, file))
		for _, locale := range []string{"zh", "en"} {
			path := filepath.Join(metadataI18nDir, locale, "newapi", file)
			copy := readOrSkip(t, path)
			if canonical != copy {
				t.Errorf("%s is out of sync with %s", path, filepath.Join(metadataDir, file))
			}
		}
	}
}

func TestFieldLabelsCoverEveryLocale(t *testing.T) {
	labels := extractFieldLabels(readOrSkip(t, webDialogPath))
	if len(labels) == 0 {
		t.Fatal("FIELD_LABELS not found")
	}
	for _, field := range MetadataSyncFields {
		if _, ok := labels[field]; !ok {
			t.Errorf("FIELD_LABELS is missing %q", field)
		}
	}

	locales, err := filepath.Glob("../web/src/i18n/locales/*.json")
	if err != nil || len(locales) == 0 {
		t.Skip("locale catalogs not available")
	}
	for _, path := range locales {
		src := readOrSkip(t, path)
		var catalog struct {
			Translation map[string]string `json:"translation"`
		}
		if err := json.Unmarshal([]byte(src), &catalog); err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		for field, label := range labels {
			if _, ok := catalog.Translation[label]; !ok {
				t.Errorf("%s: missing label %q for field %q", filepath.Base(path), label, field)
			}
		}
	}
}

var fieldLabelPattern = regexp.MustCompile(`(?m)^\s*([a-z_]+):\s*'([^']+)',?\s*$`)

func extractFieldLabels(dialogSrc string) map[string]string {
	block := sliceBetween(dialogSrc, "const FIELD_LABELS", "\n}")
	labels := map[string]string{}
	for _, match := range fieldLabelPattern.FindAllStringSubmatch(block, -1) {
		labels[match[1]] = match[2]
	}
	return labels
}
