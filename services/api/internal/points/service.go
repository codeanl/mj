package points

import (
	"context"
	"errors"
	"math"
	"strings"

	"github.com/google/uuid"
)

var ErrInvalidInput = errors.New("invalid points input")

type Service struct {
	repository Repository
}

func NewService(repository Repository) *Service {
	return &Service{repository: repository}
}

func (service *Service) GetConfig(ctx context.Context) (RuleConfig, error) {
	return service.repository.GetConfig(ctx)
}

func (service *Service) SaveConfig(ctx context.Context, input RuleConfig) (RuleConfig, error) {
	input.Settings.InitialPoints = normalize(input.Settings.InitialPoints)
	input.Settings.DefaultModelCost = normalize(input.Settings.DefaultModelCost)
	if !validValue(input.Settings.InitialPoints) || !validValue(input.Settings.DefaultModelCost) || !validMultipliers(input.Settings.ImageQualityMultipliers) || !validMultipliers(input.Settings.VideoQualityMultipliers) || !validMultipliers(input.Settings.VideoSecondsMultipliers) {
		return RuleConfig{}, ErrInvalidInput
	}
	seen := make(map[string]struct{})
	rules := make([]ModelRule, 0, len(input.Rules))
	for _, rule := range input.Rules {
		rule.ModelID = strings.TrimSpace(rule.ModelID)
		rule.Cost = normalize(rule.Cost)
		key := strings.ToLower(rule.ModelID)
		if key == "" || len([]rune(rule.ModelID)) > 120 || !validValue(rule.Cost) {
			return RuleConfig{}, ErrInvalidInput
		}
		if _, ok := seen[key]; ok {
			return RuleConfig{}, ErrInvalidInput
		}
		seen[key] = struct{}{}
		rules = append(rules, rule)
	}
	input.Rules = rules
	return service.repository.SaveConfig(ctx, input)
}

func (service *Service) GenerationCost(ctx context.Context, model, capability, parameter string) (float64, error) {
	config, err := service.repository.GetConfig(ctx)
	if err != nil {
		return 0, err
	}
	base := config.Settings.DefaultModelCost
	for _, rule := range config.Rules {
		if strings.EqualFold(strings.TrimSpace(rule.ModelID), strings.TrimSpace(model)) {
			base = rule.Cost
			break
		}
	}
	multiplier := 1.0
	if capability == "image" {
		if value, ok := config.Settings.ImageQualityMultipliers[parameter]; ok {
			multiplier = value
		}
	} else if capability == "video-quality" {
		if value, ok := config.Settings.VideoQualityMultipliers[parameter]; ok {
			multiplier = value
		}
	} else if capability == "video-seconds" {
		if value, ok := config.Settings.VideoSecondsMultipliers[parameter]; ok {
			multiplier = value
		}
	}
	return normalize(base * multiplier), nil
}

func (service *Service) Balance(ctx context.Context, userID string) (float64, error) {
	return service.repository.Balance(ctx, userID)
}

func (service *Service) Adjust(ctx context.Context, actorID string, accountID int64, input AdjustmentInput) (AdjustmentResult, error) {
	input.Amount = normalize(input.Amount)
	input.Description = strings.TrimSpace(input.Description)
	if accountID < 1 || input.Amount == 0 || math.Abs(input.Amount) > 1_000_000 || len([]rune(input.Description)) < 2 || len([]rune(input.Description)) > 200 {
		return AdjustmentResult{}, ErrInvalidInput
	}
	return service.repository.Adjust(ctx, actorID, accountID, input.Amount, input.Description, "admin-adjust:"+uuid.NewString())
}

func (service *Service) Transactions(ctx context.Context, userID string) ([]Transaction, error) {
	return service.repository.ListTransactions(ctx, userID, 20)
}

func normalize(value float64) float64 {
	return math.Round(value*100) / 100
}

func validValue(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value >= 0 && value <= 1_000_000
}

func validMultipliers(values map[string]float64) bool {
	if len(values) > 100 {
		return false
	}
	for key, value := range values {
		if strings.TrimSpace(key) == "" || len([]rune(key)) > 32 || !validValue(value) {
			return false
		}
	}
	return true
}
