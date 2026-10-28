package adminaudit

import (
	"encoding/json"
	"time"
)

type Entry struct {
	ActorUserID string
	Action      string
	TargetType  string
	TargetID    string
	Before      interface{}
	After       interface{}
	IPAddress   string
	UserAgent   string
	RequestID   string
	Succeeded   bool
	StatusCode  int
}

type Item struct {
	ID             string          `json:"id"`
	ActorAccountID int64           `json:"actorAccountId"`
	ActorUsername  string          `json:"actorUsername"`
	Action         string          `json:"action"`
	TargetType     string          `json:"targetType"`
	TargetID       string          `json:"targetId"`
	Before         json.RawMessage `json:"before"`
	After          json.RawMessage `json:"after"`
	IPAddress      string          `json:"ipAddress"`
	UserAgent      string          `json:"userAgent"`
	RequestID      string          `json:"requestId"`
	Succeeded      bool            `json:"succeeded"`
	StatusCode     int             `json:"statusCode"`
	CreatedAt      time.Time       `json:"createdAt"`
}

type Page struct {
	Items    []Item `json:"items"`
	Total    int64  `json:"total"`
	Page     int    `json:"page"`
	PageSize int    `json:"pageSize"`
}

type ListInput struct {
	Page     int
	PageSize int
	Search   string
	Action   string
}
