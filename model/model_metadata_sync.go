package model

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var metadataMutationMu sync.Mutex

// metadataTransaction serializes changes to vendors and model ownership before
// acquiring model/vendor row locks. The option anchor also covers empty tables.
func metadataTransaction(change func(*gorm.DB) error) error {
	metadataMutationMu.Lock()
	defer metadataMutationMu.Unlock()
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := lockMetadataMutation(tx); err != nil {
			return err
		}
		return change(tx)
	})
}

func lockMetadataMutation(tx *gorm.DB) error {
	anchor := Option{Key: "metadata_sync_lock", Value: ""}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&anchor).Error; err != nil {
		return err
	}
	return lockForUpdate(tx).Where(commonKeyCol+" = ?", anchor.Key).First(&anchor).Error
}

var ErrMetadataSyncConflict = errors.New("metadata changed; preview again before applying")

var MetadataSyncFields = []string{"description", "icon", "tags", "capabilities", "input_modalities", "output_modalities", "context_length", "max_output_tokens", "is_free", "vendor", "endpoints", "name_rule", "status", "lifecycle", "release_date", "knowledge_cutoff"}

// MetadataLifecycleVocabulary 是厂商生命周期状态的闭集；空串表示未知。
var MetadataLifecycleVocabulary = map[string]bool{
	"":           true,
	"ga":         true,
	"preview":    true,
	"legacy":     true,
	"deprecated": true,
	"retired":    true,
}

// MetadataLifecycleVocabulary 是厂商生命周期间的闭集；空串表示未知。
var MetadataLifecycleVocabulary = map[string]bool{
     "":           true,
     "ga":         true,
     "preview":    true,
     "legacy":     true,
     "deprecated": true,
     "retired":    true,
}

// MetadataCapabilityVocabulary is the closed set of structured capability keys.
// Keep it in sync with web/src/features/pricing/constants.ts (MODEL_CAPABILITIES).
var MetadataCapabilityVocabulary = map[string]bool{
	"chat":              true,
	"reasoning":         true,
	"tools":             true,
	"structured_output": true,
	"vision":            true,
	"files":             true,
	"audio":             true,
	"image_generation":  true,
	"video_generation":  true,
	"embedding":         true,
	"rerank":            true,
	"web_search":        true,
	"code_interpreter":  true,
	"cache_implicit":    true,
	"cache_explicit":    true,
}

// upstreamTagCapabilities maps upstream metadata tags onto the closed
// capability vocabulary. Size tags (200K / 1M) have no entry and are dropped.
var upstreamTagCapabilities = map[string]string{
	"推理":               "reasoning",
	"reasoning":        "reasoning",
	"thinking":         "reasoning",
	"工具":               "tools",
	"tools":            "tools",
	"function calling": "tools",
	"function_calling": "tools",
	"文件":               "files",
	"files":            "files",
	"file":             "files",
	"多模态":              "vision",
	"视觉":               "vision",
	"multimodal":       "vision",
	"vision":           "vision",
	"音频":               "audio",
	"audio":            "audio",
	"图片生成":             "image_generation",
	"image generation": "image_generation",
	"image_generation": "image_generation",
	"视频":               "video_generation",
	"video generation": "video_generation",
	"video_generation": "video_generation",
	"嵌入":               "embedding",
	"embedding":        "embedding",
	"embeddings":       "embedding",
	"重排":               "rerank",
	"rerank":           "rerank",
	"联网":               "web_search",
	"web search":       "web_search",
	"web_search":       "web_search",
	"代码解释器":            "code_interpreter",
	"code interpreter": "code_interpreter",
	"code_interpreter": "code_interpreter",
	"对话":               "chat",
	"chat":             "chat",
}

// CapabilitiesFromUpstreamTags converts upstream metadata tags into capability
// keys. Unknown tags and context-size tags are ignored.
func CapabilitiesFromUpstreamTags(raw string) []string {
	out := make([]string, 0, 4)
	seen := make(map[string]bool, 4)
	for _, tag := range SplitMetadataList(raw) {
		capability, ok := upstreamTagCapabilities[strings.ToLower(strings.TrimSpace(tag))]
		if !ok || seen[capability] {
			continue
		}
		seen[capability] = true
		out = append(out, capability)
	}
	return out
}

// BoolToInt normalizes JSON boolean flags onto the 0/1 storage convention.
func BoolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

// MetadataModalityVocabulary is the closed set of input/output modalities.
// Keep it in sync with web/src/features/pricing/constants.ts (MODALITIES).
var MetadataModalityVocabulary = map[string]bool{
	"text":  true,
	"image": true,
	"audio": true,
	"video": true,
	"file":  true,
}

func ValidateModelModalities(raw string) error {
	for _, item := range SplitMetadataList(raw) {
		if !MetadataModalityVocabulary[item] {
			return fmt.Errorf("unsupported model modality: %s", item)
		}
	}
	return nil
}

// SplitMetadataList splits the comma-separated list columns (tags, capabilities)
// and removes blanks and duplicates while preserving order.
func SplitMetadataList(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{}
	}
	parts := strings.FieldsFunc(raw, func(r rune) bool {
		return r == ',' || r == ';' || r == '|'
	})
	out := make([]string, 0, len(parts))
	seen := make(map[string]bool, len(parts))
	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item == "" || seen[item] {
			continue
		}
		seen[item] = true
		out = append(out, item)
	}
	return out
}

// NormalizeCapabilities lowercases, trims and deduplicates upstream capability keys.
func NormalizeCapabilities(items []string) []string {
	out := make([]string, 0, len(items))
	seen := make(map[string]bool, len(items))
	for _, raw := range items {
		item := strings.ToLower(strings.TrimSpace(raw))
		if item == "" || seen[item] {
			continue
		}
		seen[item] = true
		out = append(out, item)
	}
	return out
}

// ValidateModelCapabilities rejects capability keys outside the closed vocabulary.
func ValidateModelCapabilities(raw string) error {
	for _, item := range SplitMetadataList(raw) {
		if !MetadataCapabilityVocabulary[item] {
			return fmt.Errorf("unsupported model capability: %s", item)
		}
	}
	return nil
}

type MetadataValues struct {
	Description      string `json:"description"`
	Icon             string `json:"icon"`
	Tags             string `json:"tags"`
	Capabilities     string `json:"capabilities"`
	InputModalities  string `json:"input_modalities"`
	OutputModalities string `json:"output_modalities"`
	ContextLength    int    `json:"context_length"`
	MaxOutputTokens  int    `json:"max_output_tokens"`
	IsFree           int    `json:"is_free"`
	Vendor           string `json:"vendor"`
	Endpoints        string `json:"endpoints"`
	NameRule         int    `json:"name_rule"`
	Status           int    `json:"status"`
	Lifecycle        string `json:"lifecycle"`
	ReleaseDate      string `json:"release_date"`
	KnowledgeCutoff  string `json:"knowledge_cutoff"`
     Lifecycle        string `json:"lifecycle"`
     ReleaseDate      string `json:"release_date"`
     KnowledgeCutoff  string `json:"knowledge_cutoff"`
	RecordVersion string   `json:"record_version"`
	Create        bool     `json:"create"`
	Fields        []string `json:"fields"`
}

type MetadataSyncUpdate struct {
	MetadataSyncSelection
	Values MetadataValues
}

type MetadataSyncResult struct {
	CreatedModels  []string                `json:"created_models"`
	UpdatedModels  []MetadataSyncSelection `json:"updated_models"`
	CreatedVendors []string                `json:"created_vendors"`
}

func MetadataRecordVersion(local *Model, localVendor, upstreamVendor *Vendor) string {
	encoded, _ := common.Marshal([]any{local, localVendor, upstreamVendor})
	return fmt.Sprintf("%x", sha256.Sum256(encoded))
}

func GetMetadataSyncState(db *gorm.DB) (map[string]*Model, map[string]*Vendor, error) {
	var models []*Model
	var vendors []*Vendor
	if err := db.Session(&gorm.Session{}).Order("id").Find(&models).Error; err != nil {
		return nil, nil, err
	}
	if err := db.Session(&gorm.Session{}).Order("id").Find(&vendors).Error; err != nil {
		return nil, nil, err
	}
	modelMap := make(map[string]*Model, len(models))
	vendorMap := make(map[string]*Vendor, len(vendors))
	for _, item := range models {
		modelMap[item.ModelName] = item
	}
	for _, item := range vendors {
		vendorMap[item.Name] = item
	}
	return modelMap, vendorMap, nil
}

func ValidateMetadataValues(values MetadataValues) error {
	if values.NameRule < NameRuleExact || values.NameRule > NameRuleSuffix {
		return errors.New("invalid metadata matching rule")
	}
	if values.Status != 0 && values.Status != 1 {
		return errors.New("invalid catalog visibility")
	}
	if values.IsFree != 0 && values.IsFree != 1 {
		return errors.New("is_free must be 0 or 1")
	}
	if values.ContextLength < 0 || values.MaxOutputTokens < 0 {
		return errors.New("context_length and max_output_tokens must not be negative")
	}
	if values.ContextLength > 0 && values.MaxOutputTokens > values.ContextLength {
		return errors.New("max_output_tokens must not exceed context_length")
	}
	lifecycle := strings.ToLower(strings.TrimSpace(values.Lifecycle))
	if !MetadataLifecycleVocabulary[lifecycle] {
		return fmt.Errorf("invalid lifecycle: %s", values.Lifecycle)
	}
	if err := ValidateModelCapabilities(values.Capabilities); err != nil {
		return err
	}
	if err := ValidateModelModalities(values.InputModalities); err != nil {
		return err
	}
	if err := ValidateModelModalities(values.OutputModalities); err != nil {
		return err
	}
	return ValidateModelEndpoints(values.Endpoints)
}

// ValidateModelEndpoints accepts the existing map form (custom paths) and
// type-array form (declared protocols), but never arbitrary JSON scalars.
func ValidateModelEndpoints(raw string) error {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	var value any
	if err := common.UnmarshalJsonStr(raw, &value); err != nil {
		return fmt.Errorf("invalid endpoints: %w", err)
	}
	switch endpoints := value.(type) {
	case []any:
		for _, endpoint := range endpoints {
			if text, ok := endpoint.(string); !ok || strings.TrimSpace(text) == "" {
				return errors.New("endpoint types must be non-empty strings")
			}
		}
	case map[string]any:
		for key, endpoint := range endpoints {
			if strings.TrimSpace(key) == "" {
				return errors.New("endpoint type is required")
			}
			switch details := endpoint.(type) {
			case string:
				if !strings.HasPrefix(details, "/") {
					return errors.New("endpoint paths must start with /")
				}
			case map[string]any:
				path, _ := details["path"].(string)
				if !strings.HasPrefix(path, "/") {
					return errors.New("endpoint paths must start with /")
				}
				if method, exists := details["method"]; exists {
					switch method {
					case "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS":
					default:
						return errors.New("invalid endpoint HTTP method")
					}
				}
			default:
				return errors.New("endpoint configuration must be a path or object")
			}
		}
	default:
		return errors.New("endpoints must be a JSON object or array")
	}
	return nil
}

func ApplyMetadataSync(updates []MetadataSyncUpdate, upstreamVendors map[string]Vendor) (*MetadataSyncResult, error) {
	if len(updates) == 0 {
		return nil, errors.New("select metadata changes before applying")
	}
	seen := make(map[string]bool)
	for _, update := range updates {
		if seen[update.ModelName] || strings.TrimSpace(update.ModelName) == "" {
			return nil, errors.New("invalid or duplicate model selection")
		}
		seen[update.ModelName] = true
		if update.RecordVersion == "" {
			return nil, ErrMetadataSyncConflict
		}
		if err := ValidateMetadataValues(update.Values); err != nil {
			return nil, err
		}
		if !update.Create && len(update.Fields) == 0 {
			return nil, errors.New("select fields to update")
		}
		allowed := make(map[string]bool)
		for _, field := range MetadataSyncFields {
			allowed[field] = true
		}
		for _, field := range update.Fields {
			if !allowed[field] {
				return nil, fmt.Errorf("unsupported metadata field: %s", field)
			}
		}
	}
	result := &MetadataSyncResult{CreatedModels: []string{}, UpdatedModels: []MetadataSyncSelection{}, CreatedVendors: []string{}}
	err := metadataTransaction(func(tx *gorm.DB) error {
		locals, vendors, err := GetMetadataSyncState(lockForUpdate(tx))
		if err != nil {
			return err
		}
		vendorByID := make(map[int]*Vendor)
		for _, vendor := range vendors {
			vendorByID[vendor.Id] = vendor
		}
		// Verify the entire selection before any write, including shared vendors.
		for _, update := range updates {
			local := locals[update.ModelName]
			if local != nil && local.SyncOfficial == 0 {
				return fmt.Errorf("metadata sync is disabled for %s", update.ModelName)
			}
			var localVendor *Vendor
			if local != nil {
				localVendor = vendorByID[local.VendorID]
			}
			if MetadataRecordVersion(local, localVendor, FindMetadataVendor(vendors, update.Values.Vendor)) != update.RecordVersion {
				return fmt.Errorf("%w: %s", ErrMetadataSyncConflict, update.ModelName)
			}
			if update.Create && local != nil || !update.Create && local == nil {
				return ErrMetadataSyncConflict
			}
		}
		for _, update := range updates {
			fields := make(map[string]any)
			selected := update.Fields
			if update.Create {
				selected = MetadataSyncFields
			}
			for _, field := range selected {
				switch field {
				case "description":
					fields[field] = update.Values.Description
				case "icon":
					fields[field] = update.Values.Icon
				case "tags":
					fields[field] = update.Values.Tags
				case "capabilities":
					fields[field] = update.Values.Capabilities
				case "input_modalities":
					fields[field] = update.Values.InputModalities
				case "output_modalities":
					fields[field] = update.Values.OutputModalities
				case "context_length":
					fields[field] = update.Values.ContextLength
				case "max_output_tokens":
					fields[field] = update.Values.MaxOutputTokens
				case "is_free":
					fields[field] = update.Values.IsFree
				case "lifecycle":
					fields[field] = strings.ToLower(strings.TrimSpace(update.Values.Lifecycle))
				case "release_date":
					fields[field] = strings.TrimSpace(update.Values.ReleaseDate)
				case "knowledge_cutoff":
					fields[field] = strings.TrimSpace(update.Values.KnowledgeCutoff)
				case "endpoints":
					fields[field] = update.Values.Endpoints
				case "name_rule":
					fields[field] = update.Values.NameRule
				case "status":
					fields[field] = update.Values.Status
				case "vendor":
					vendorID := 0
					name := update.Values.Vendor
					if name != "" {
						vendor := FindMetadataVendor(vendors, name)
						if vendor == nil {
							up, ok := upstreamVendors[name]
							if !ok {
								return fmt.Errorf("upstream vendor not found: %s", name)
							}
							vendor = &Vendor{Name: name, Description: up.Description, Icon: up.Icon, Status: 1, CreatedTime: common.GetTimestamp(), UpdatedTime: common.GetTimestamp()}
							if err := validateVendorMetadata(tx, vendor); err != nil {
								return err
							}
							if err := tx.Create(vendor).Error; err != nil {
								return err
							}
							vendors[name] = vendor
							result.CreatedVendors = append(result.CreatedVendors, name)
						}
						vendorID = vendor.Id
					}
					fields["vendor_id"] = vendorID
				}
			}
			fields["updated_time"] = common.GetTimestamp()
			if update.Create {
				fields["model_name"] = update.ModelName
				fields["sync_official"] = 1
				fields["created_time"] = common.GetTimestamp()
				if err := tx.Model(&Model{}).Create(fields).Error; err != nil {
					return err
				}
				result.CreatedModels = append(result.CreatedModels, update.ModelName)
			} else {
				if err := tx.Model(&Model{}).Where("id = ?", locals[update.ModelName].Id).Updates(fields).Error; err != nil {
					return err
				}
				result.UpdatedModels = append(result.UpdatedModels, update.MetadataSyncSelection)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	RefreshPricing()
	return result, nil
}
