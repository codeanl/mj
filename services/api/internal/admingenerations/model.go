package admingenerations

import "time"

type Task struct {
	ID              string     `json:"taskId"`
	AssetID         string     `json:"assetId"`
	Kind            string     `json:"type"`
	Status          string     `json:"status"`
	Model           string     `json:"model"`
	Prompt          string     `json:"prompt"`
	Size            string     `json:"size"`
	Quality         string     `json:"quality"`
	Width           int        `json:"width"`
	Height          int        `json:"height"`
	ReferenceCount  int        `json:"referenceCount"`
	PointsCost      float64    `json:"pointsCost"`
	PointsRefunded  bool       `json:"pointsRefunded"`
	RetryCount      int        `json:"retryCount"`
	ErrorMessage    string     `json:"errorMessage,omitempty"`
	AccountID       int64      `json:"accountId"`
	Username        string     `json:"username"`
	Email           string     `json:"email"`
	ChannelID       string     `json:"channelId,omitempty"`
	ChannelName     string     `json:"channelName"`
	ChannelProtocol string     `json:"channelProtocol"`
	CreatedAt       time.Time  `json:"createdAt"`
	StartedAt       *time.Time `json:"startedAt,omitempty"`
	CompletedAt     *time.Time `json:"completedAt,omitempty"`
	Attempts        []Attempt  `json:"attempts"`
	UpstreamTaskID  string     `json:"upstreamTaskId,omitempty"`
	ReviewReason    string     `json:"reviewReason,omitempty"`
}

type Attempt struct {
	AttemptNo    int        `json:"attemptNo"`
	ChannelID    string     `json:"channelId,omitempty"`
	ChannelName  string     `json:"channelName"`
	Protocol     string     `json:"protocol"`
	RequestPath  string     `json:"requestPath"`
	Status       string     `json:"status"`
	HTTPStatus   *int       `json:"httpStatus,omitempty"`
	DurationMS   *int64     `json:"durationMs,omitempty"`
	ErrorMessage string     `json:"errorMessage,omitempty"`
	CreatedAt    time.Time  `json:"createdAt"`
	CompletedAt  *time.Time `json:"completedAt,omitempty"`
}

type Summary struct {
	Total       int64   `json:"total"`
	Queued      int64   `json:"queued"`
	Running     int64   `json:"running"`
	Succeeded   int64   `json:"succeeded"`
	Failed      int64   `json:"failed"`
	Cancelled   int64   `json:"cancelled"`
	NeedsReview int64   `json:"needsReview"`
	PointsSpent float64 `json:"pointsSpent"`
}

type Page struct {
	Items    []Task  `json:"items"`
	Total    int64   `json:"total"`
	Page     int     `json:"page"`
	PageSize int     `json:"pageSize"`
	Summary  Summary `json:"summary"`
}

type ListInput struct {
	Page      int
	PageSize  int
	Search    string
	AccountID *int64
	Status    string
	Kind      string
}

type ActionResult struct {
	Task              Task     `json:"task"`
	PointsRemaining   *float64 `json:"pointsRemaining,omitempty"`
	RefundedPointCost float64  `json:"refundedPointCost,omitempty"`
}
