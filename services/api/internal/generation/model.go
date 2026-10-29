package generation

import "time"

type TaskStatus string

const (
	TaskQueued      TaskStatus = "queued"
	TaskRunning     TaskStatus = "running"
	TaskNeedsReview TaskStatus = "needs_review"
	TaskSucceeded   TaskStatus = "succeeded"
	TaskFailed      TaskStatus = "failed"
)

const (
	DefaultImageRatio      = "16:9"
	DefaultImageResolution = "2K"
	ProviderImageQuality   = "high"
	MaxImageCount          = 4
	MaxReferenceImages     = 3
	VideoModeText          = "text"
	VideoModeFrames        = "frames"
	VideoModeReference     = "reference"
	VideoRoleFirstFrame    = "first_frame"
	VideoRoleLastFrame     = "last_frame"
	VideoRoleImage         = "reference_image"
	VideoRoleVideo         = "reference_video"
	VideoRoleAudio         = "reference_audio"
)

type Task struct {
	ID                  string     `json:"taskId"`
	AssetID             string     `json:"assetId"`
	ChannelID           string     `json:"channelId"`
	Kind                string     `json:"type"`
	Status              TaskStatus `json:"status"`
	Model               string     `json:"model"`
	Prompt              string     `json:"prompt"`
	Size                string     `json:"size"`
	Width               int        `json:"width"`
	Height              int        `json:"height"`
	Quality             string     `json:"quality"`
	DurationSeconds     int        `json:"durationSeconds,omitempty"`
	VideoMode           string     `json:"videoMode,omitempty"`
	SoundEnabled        bool       `json:"soundEnabled"`
	WatermarkEnabled    bool       `json:"watermarkEnabled"`
	ErrorMessage        string     `json:"errorMessage,omitempty"`
	PointsCost          float64    `json:"pointsCost"`
	PointsRemaining     float64    `json:"pointsRemaining"`
	ReferenceAssetIDs   []string   `json:"referenceAssetIds,omitempty"`
	UpstreamTaskID      string     `json:"upstreamTaskId,omitempty"`
	UpstreamQueryPath   string     `json:"upstreamQueryPath,omitempty"`
	ReviewReason        string     `json:"reviewReason,omitempty"`
	CreatedAt           time.Time  `json:"createdAt"`
	userID              string
	pointsTransactionID string
	pointsRefunded      bool
	providerSize        string
	providerQuality     string
	retryCount          int
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
	RequestID         string
	UserID            string
	Prompt            string
	Model             string
	Size              string
	Quality           string
	Count             int
	ReferenceAssetIDs []string
}

type CreateVideoInput struct {
	RequestID        string
	UserID           string
	Prompt           string
	Model            string
	Size             string
	Quality          string
	DurationSeconds  int
	SoundEnabled     bool
	WatermarkEnabled bool
	Mode             string
	References       []VideoReference
}

type VideoReference struct {
	AssetID string `json:"assetId"`
	Role    string `json:"role"`
}

type VideoOptions struct {
	ChannelID        string
	Model            string
	Ratio            string
	Resolution       string
	DurationSeconds  int
	SoundEnabled     bool
	WatermarkEnabled bool
	Width            int
	Height           int
	Mode             string
}
type VideoBatch struct {
	Tasks           []Task  `json:"tasks"`
	PointsRemaining float64 `json:"pointsRemaining"`
}

type ImageBatch struct {
	Tasks           []Task  `json:"tasks"`
	PointsRemaining float64 `json:"pointsRemaining"`
}

type QuoteInput struct {
	Type             string `json:"type"`
	Model            string `json:"model"`
	Size             string `json:"size"`
	Quality          string `json:"quality"`
	Count            int    `json:"count"`
	DurationSeconds  int    `json:"durationSeconds"`
	Mode             string `json:"mode"`
	SoundEnabled     bool   `json:"soundEnabled"`
	WatermarkEnabled bool   `json:"watermarkEnabled"`
}

type Quote struct {
	Type           string  `json:"type"`
	UnitCost       float64 `json:"unitCost"`
	Quantity       int     `json:"quantity"`
	TotalCost      float64 `json:"totalCost"`
	Balance        float64 `json:"balance"`
	Remaining      float64 `json:"remaining"`
	Affordable     bool    `json:"affordable"`
	PricingSummary string  `json:"pricingSummary"`
}

type ReferenceImage struct {
	Content  []byte
	MimeType string
	Name     string
	Kind     string
	Role     string
}

type storedReference struct {
	StorageKey   string
	OriginalName string
	MimeType     string
	Kind         string
	Role         string
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
	Durations []Option          `json:"durations,omitempty"`
}

type Capabilities struct {
	Image GenerationCapability `json:"image"`
	Video GenerationCapability `json:"video"`
}

type CompletedAsset struct {
	StorageKey      string
	OriginalName    string
	MimeType        string
	SizeBytes       int64
	Width           int
	Height          int
	DurationSeconds *float64
}
