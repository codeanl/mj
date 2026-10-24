package generation

import "time"

type TaskStatus string

const (
	TaskQueued    TaskStatus = "queued"
	TaskRunning   TaskStatus = "running"
	TaskSucceeded TaskStatus = "succeeded"
	TaskFailed    TaskStatus = "failed"
)

const (
	DefaultImageRatio      = "16:9"
	DefaultImageResolution = "2K"
	ProviderImageQuality   = "high"
)

type Task struct {
	ID              string     `json:"taskId"`
	AssetID         string     `json:"assetId"`
	ChannelID       string     `json:"channelId"`
	Kind            string     `json:"type"`
	Status          TaskStatus `json:"status"`
	Model           string     `json:"model"`
	Prompt          string     `json:"prompt"`
	Size            string     `json:"size"`
	Width           int        `json:"width"`
	Height          int        `json:"height"`
	Quality         string     `json:"quality"`
	ErrorMessage    string     `json:"errorMessage,omitempty"`
	CreatedAt       time.Time  `json:"createdAt"`
	providerSize    string
	providerQuality string
}

type ImageOptions struct {
	ChannelID       string
	Model           string
	Ratio           string
	Resolution      string
	ProviderSize    string
	ProviderQuality string
	Width           int
	Height          int
}

type CreateImageInput struct {
	UserID  string
	Prompt  string
	Model   string
	Size    string
	Quality string
}

type Option struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

type ImageSizeOption struct {
	Value  string `json:"value"`
	Label  string `json:"label"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

type GenerationCapability struct {
	Enabled   bool              `json:"enabled"`
	Models    []Option          `json:"models"`
	Sizes     []ImageSizeOption `json:"sizes"`
	Qualities []Option          `json:"qualities"`
}

type Capabilities struct {
	Image GenerationCapability `json:"image"`
	Video GenerationCapability `json:"video"`
}

type CompletedAsset struct {
	StorageKey   string
	OriginalName string
	MimeType     string
	SizeBytes    int64
	Width        int
	Height       int
}
