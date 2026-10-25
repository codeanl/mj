package points

import "time"

type Settings struct {
	InitialPoints           float64            `json:"initialPoints"`
	DefaultModelCost        float64            `json:"defaultModelCost"`
	ImageQualityMultipliers map[string]float64 `json:"imageQualityMultipliers"`
	VideoQualityMultipliers map[string]float64 `json:"videoQualityMultipliers"`
	VideoSecondsMultipliers map[string]float64 `json:"videoSecondsMultipliers"`
	UpdatedAt               time.Time          `json:"updatedAt"`
}

type ModelRule struct {
	ModelID string  `json:"modelId"`
	Cost    float64 `json:"cost"`
}

type CatalogModel struct {
	ModelID     string `json:"modelId"`
	DisplayName string `json:"displayName"`
	Capability  string `json:"capability"`
}

type RuleConfig struct {
	Settings Settings       `json:"settings"`
	Rules    []ModelRule    `json:"rules"`
	Models   []CatalogModel `json:"models"`
}

type AdjustmentInput struct {
	Amount      float64 `json:"amount"`
	Description string  `json:"description"`
}

type AdjustmentResult struct {
	Balance float64 `json:"balance"`
}

type Transaction struct {
	ID           string    `json:"id"`
	Type         string    `json:"type"`
	Amount       float64   `json:"amount"`
	BalanceAfter float64   `json:"balanceAfter"`
	Description  string    `json:"description"`
	Model        string    `json:"model,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
}
