package assets

import "time"

type Kind string
type Source string
type Status string

const (
	KindImage        Kind   = "image"
	KindVideo        Kind   = "video"
	SourceGenerated  Source = "generated"
	SourceUploaded   Source = "uploaded"
	StatusGenerating Status = "generating"
	StatusReady      Status = "ready"
	StatusFailed     Status = "failed"
)

type Asset struct {
	ID              string    `json:"id"`
	Kind            Kind      `json:"type"`
	Source          Source    `json:"source"`
	Status          Status    `json:"status"`
	Title           string    `json:"title"`
	URL             string    `json:"url"`
	DownloadURL     string    `json:"downloadUrl"`
	SizeBytes       int64     `json:"sizeBytes"`
	Width           int       `json:"width"`
	Height          int       `json:"height"`
	DurationSeconds *float64  `json:"durationSeconds,omitempty"`
	CreatedAt       time.Time `json:"createdAt"`
	ErrorMessage    string    `json:"errorMessage,omitempty"`
	OriginalName    string    `json:"-"`
	MimeType        string    `json:"-"`
	storageKey      string
}

type Page struct {
	Items    []Asset `json:"items"`
	Total    int64   `json:"total"`
	Page     int     `json:"page"`
	PageSize int     `json:"pageSize"`
}

type CreateInput struct {
	ID           string
	UserID       string
	Kind         Kind
	Source       Source
	Title        string
	OriginalName string
	StorageKey   string
	MimeType     string
	SizeBytes    int64
	Width        int
	Height       int
}
