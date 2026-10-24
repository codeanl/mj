package modelchannels

import "time"

type Channel struct {
	ID               string     `json:"id"`
	Name             string     `json:"name"`
	BaseURL          string     `json:"baseUrl"`
	Protocol         string     `json:"protocol"`
	Enabled          bool       `json:"enabled"`
	HasAPIKey        bool       `json:"hasApiKey"`
	APIKeyMasked     string     `json:"apiKeyMasked"`
	LastTestStatus   string     `json:"lastTestStatus"`
	LastTestMessage  string     `json:"lastTestMessage"`
	LastTestedAt     *time.Time `json:"lastTestedAt,omitempty"`
	CreatedAt        time.Time  `json:"createdAt"`
	UpdatedAt        time.Time  `json:"updatedAt"`
	Models           []Model    `json:"models"`
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

type ResolvedModel struct {
	ChannelID     string
	BaseURL       string
	APIKey        string
	Protocol      string
	UpstreamModel string
}

type ChannelInput struct {
	Name        string `json:"name"`
	BaseURL     string `json:"baseUrl"`
	Protocol    string `json:"protocol"`
	APIKey      string `json:"apiKey"`
	ClearAPIKey bool   `json:"clearApiKey"`
	Enabled     bool   `json:"enabled"`
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
