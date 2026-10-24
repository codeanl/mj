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
	ImageWidth   = 2048
	ImageHeight  = 1152
	ImageSize    = "2048x1152"
	ImageQuality = "high"
)

type Task struct {
	ID           string     `json:"taskId"`
	AssetID      string     `json:"assetId"`
	Kind         string     `json:"type"`
	Status       TaskStatus `json:"status"`
	Model        string     `json:"model"`
	Prompt       string     `json:"prompt"`
	Width        int        `json:"width"`
	Height       int        `json:"height"`
	Quality      string     `json:"quality"`
	ErrorMessage string     `json:"errorMessage,omitempty"`
	CreatedAt    time.Time  `json:"createdAt"`
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
