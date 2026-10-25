package modelchannels

import "time"

type Channel struct {
	ID               string         `json:"id"`
	Name             string         `json:"name"`
	BaseURL          string         `json:"baseUrl"`
	Protocol         string         `json:"protocol"`
	AdvancedConfig   AdvancedConfig `json:"advancedConfig"`
	Enabled          bool           `json:"enabled"`
	HasAPIKey        bool           `json:"hasApiKey"`
	APIKeyMasked     string         `json:"apiKeyMasked"`
	LastTestStatus   string         `json:"lastTestStatus"`
	LastTestMessage  string         `json:"lastTestMessage"`
	LastTestedAt     *time.Time     `json:"lastTestedAt,omitempty"`
	CreatedAt        time.Time      `json:"createdAt"`
	UpdatedAt        time.Time      `json:"updatedAt"`
	Models           []Model        `json:"models"`
	apiKeyCiphertext string
}

type Model struct {
	ID          string    `json:"id"`
	ChannelID   string    `json:"channelId"`
	ModelID     string    `json:"modelId"`
	DisplayName string    `json:"displayName"`
	Capability  string    `json:"capability"`
	Enabled     bool      `json:"enabled"`
	SortOrder   int       `json:"sortOrder"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type PublicModel struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	Capability  string `json:"capability"`
}

type OperationConfig struct {
	CreatePath             string `json:"createPath,omitempty"`
	EditPath               string `json:"editPath,omitempty"`
	ImageToVideoPath       string `json:"imageToVideoPath,omitempty"`
	QueryPath              string `json:"queryPath,omitempty"`
	CancelPath             string `json:"cancelPath,omitempty"`
	CancelMethod           string `json:"cancelMethod,omitempty"`
	RequestTemplate        string `json:"requestTemplate,omitempty"`
	ResultField            string `json:"resultField,omitempty"`
	StatusField            string `json:"statusField,omitempty"`
	DurationRange          string `json:"durationRange,omitempty"`
	ReferenceRule          string `json:"referenceRule,omitempty"`
	SupportsReferenceImage bool   `json:"supportsReferenceImage"`
	SupportsReferenceVideo bool   `json:"supportsReferenceVideo"`
	SupportsReferenceAudio bool   `json:"supportsReferenceAudio"`
}

type AdvancedConfig struct {
	APIFormat              string                     `json:"apiFormat"`
	AuthMode               string                     `json:"authMode"`
	AuthHeader             string                     `json:"authHeader,omitempty"`
	AuthPrefix             string                     `json:"authPrefix,omitempty"`
	DocumentationURL       string                     `json:"documentationUrl,omitempty"`
	ModelCatalogPaths      []string                   `json:"modelCatalogPaths"`
	CreatePath             string                     `json:"createPath,omitempty"`
	EditPath               string                     `json:"editPath,omitempty"`
	ImageToVideoPath       string                     `json:"imageToVideoPath,omitempty"`
	QueryPath              string                     `json:"queryPath,omitempty"`
	CancelPath             string                     `json:"cancelPath,omitempty"`
	CancelMethod           string                     `json:"cancelMethod,omitempty"`
	RequestTemplate        string                     `json:"requestTemplate,omitempty"`
	ResultField            string                     `json:"resultField,omitempty"`
	StatusField            string                     `json:"statusField,omitempty"`
	DurationRange          string                     `json:"durationRange,omitempty"`
	ReferenceRule          string                     `json:"referenceRule,omitempty"`
	SupportsReferenceImage bool                       `json:"supportsReferenceImage"`
	SupportsReferenceVideo bool                       `json:"supportsReferenceVideo"`
	SupportsReferenceAudio bool                       `json:"supportsReferenceAudio"`
	OperationConfigs       map[string]OperationConfig `json:"operationConfigs,omitempty"`
}

type BuiltInModel struct {
	ID         string `json:"id"`
	Label      string `json:"label"`
	Capability string `json:"capability"`
}

type ProtocolDefinition struct {
	ID                string                     `json:"id"`
	Label             string                     `json:"label"`
	Description       string                     `json:"description"`
	APIFormat         string                     `json:"apiFormat"`
	AuthMode          string                     `json:"authMode"`
	DefaultBaseURL    string                     `json:"defaultBaseUrl,omitempty"`
	ModelCatalogPaths []string                   `json:"modelCatalogPaths"`
	Capabilities      []string                   `json:"capabilities"`
	Operations        map[string]OperationConfig `json:"operations"`
	BuiltInModels     []BuiltInModel             `json:"builtInModels,omitempty"`
	Strict            bool                       `json:"strict"`
	Advanced          bool                       `json:"advanced"`
}

type ResolvedModel struct {
	ChannelID      string
	BaseURL        string
	APIKey         string
	Protocol       string
	AdvancedConfig AdvancedConfig
	UpstreamModel  string
}

type ChannelInput struct {
	Name           string         `json:"name"`
	BaseURL        string         `json:"baseUrl"`
	Protocol       string         `json:"protocol"`
	APIKey         string         `json:"apiKey"`
	ClearAPIKey    bool           `json:"clearApiKey"`
	Enabled        bool           `json:"enabled"`
	AdvancedConfig AdvancedConfig `json:"advancedConfig"`
}

type ModelInput struct {
	ModelID     string `json:"modelId"`
	DisplayName string `json:"displayName"`
	Capability  string `json:"capability"`
	Enabled     bool   `json:"enabled"`
	SortOrder   int    `json:"sortOrder"`
}

type ConnectionResult struct {
	Status           string   `json:"status"`
	Message          string   `json:"message"`
	DiscoveredModels []string `json:"discoveredModels"`
}
