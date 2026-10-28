package cdk

import "time"

type GenerateInput struct {
	Count          int     `json:"count"`
	Points         float64 `json:"points"`
	MaxRedemptions int     `json:"maxRedemptions"`
	ExpiresInDays  *int    `json:"expiresInDays"`
	Note           string  `json:"note"`
}

type Code struct {
	ID             string       `json:"id"`
	Code           string       `json:"code"`
	CodePreview    string       `json:"codePreview"`
	Points         float64      `json:"points"`
	MaxRedemptions int          `json:"maxRedemptions"`
	RedeemedCount  int          `json:"redeemedCount"`
	Status         string       `json:"status"`
	Note           string       `json:"note"`
	ExpiresAt      *time.Time   `json:"expiresAt,omitempty"`
	CreatedAt      time.Time    `json:"createdAt"`
	Redemptions    []Redemption `json:"redemptions"`
}

type Redemption struct {
	AccountID  int64     `json:"accountId"`
	Username   string    `json:"username"`
	Points     float64   `json:"points"`
	RedeemedAt time.Time `json:"redeemedAt"`
}

type ListInput struct {
	Page     int
	PageSize int
	Search   string
	Filter   string
	CodeHash string
}

type Stats struct {
	Total    int64 `json:"total"`
	Redeemed int64 `json:"redeemed"`
	Unused   int64 `json:"unused"`
	Expired  int64 `json:"expired"`
}

type Page struct {
	Items    []Code `json:"items"`
	Total    int64  `json:"total"`
	Page     int    `json:"page"`
	PageSize int    `json:"pageSize"`
	Stats    Stats  `json:"stats"`
}

type RedeemInput struct {
	Code string `json:"code"`
}

type RedeemResult struct {
	Points     float64   `json:"points"`
	Balance    float64   `json:"balance"`
	RedeemedAt time.Time `json:"redeemedAt"`
}
