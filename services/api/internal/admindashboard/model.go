package admindashboard

import "time"

type Summary struct {
	UsersTotal          int64   `json:"usersTotal"`
	UsersToday          int64   `json:"usersToday"`
	TasksToday          int64   `json:"tasksToday"`
	SucceededToday      int64   `json:"succeededToday"`
	FailedToday         int64   `json:"failedToday"`
	SuccessRate         float64 `json:"successRate"`
	PointsSpentToday    float64 `json:"pointsSpentToday"`
	ActiveTasks         int64   `json:"activeTasks"`
	NeedsReview         int64   `json:"needsReview"`
	StorageBytes        int64   `json:"storageBytes"`
	AverageLatencyMS    int64   `json:"averageLatencyMs"`
	UnhealthyChannels   int64   `json:"unhealthyChannels"`
	EnabledChannelCount int64   `json:"enabledChannelCount"`
}

type DailyMetric struct {
	Date      time.Time `json:"date"`
	Total     int64     `json:"total"`
	Succeeded int64     `json:"succeeded"`
	Failed    int64     `json:"failed"`
	Points    float64   `json:"points"`
}

type Alert struct {
	Type      string    `json:"type"`
	TargetID  string    `json:"targetId"`
	Title     string    `json:"title"`
	Detail    string    `json:"detail"`
	CreatedAt time.Time `json:"createdAt"`
}

type Dashboard struct {
	Summary Summary       `json:"summary"`
	Trend   []DailyMetric `json:"trend"`
	Alerts  []Alert       `json:"alerts"`
}
