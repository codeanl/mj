package points

import (
	"context"
	"errors"
	"testing"
)

type memoryRepository struct {
	config RuleConfig
}

func (repository *memoryRepository) GetConfig(context.Context) (RuleConfig, error) {
	return repository.config, nil
}
func (repository *memoryRepository) SaveConfig(_ context.Context, config RuleConfig) (RuleConfig, error) {
	repository.config = config
	return config, nil
}
func (repository *memoryRepository) Balance(context.Context, string) (float64, error) {
	return 100, nil
}
func (repository *memoryRepository) Adjust(context.Context, string, int64, float64, string, string) (AdjustmentResult, error) {
	return AdjustmentResult{Balance: 100}, nil
}
func (repository *memoryRepository) ListTransactions(context.Context, string, int) ([]Transaction, error) {
	return []Transaction{}, nil
}

func TestGenerationCostUsesModelAndImageQualityMultipliers(t *testing.T) {
	repository := &memoryRepository{config: RuleConfig{Settings: Settings{DefaultModelCost: 1, ImageQualityMultipliers: map[string]float64{"1K": 1, "2K": 2}}, Rules: []ModelRule{{ModelID: "gpt-image-2", Cost: 2.5}}}}
	service := NewService(repository)
	cost, err := service.GenerationCost(context.Background(), "GPT-IMAGE-2", "image", "2K")
	if err != nil || cost != 5 {
		t.Fatalf("expected 5 points, got %v err=%v", cost, err)
	}
	fallback, err := service.GenerationCost(context.Background(), "other-model", "image", "1K")
	if err != nil || fallback != 1 {
		t.Fatalf("expected default 1 point, got %v err=%v", fallback, err)
	}
}

func TestSaveConfigRejectsInvalidOrDuplicateRules(t *testing.T) {
	service := NewService(&memoryRepository{})
	base := RuleConfig{Settings: Settings{InitialPoints: 100, DefaultModelCost: 1, ImageQualityMultipliers: map[string]float64{"1K": 1}, VideoQualityMultipliers: map[string]float64{}, VideoSecondsMultipliers: map[string]float64{}}}
	for _, rules := range [][]ModelRule{{{ModelID: "model", Cost: -1}}, {{ModelID: "model", Cost: 1}, {ModelID: "MODEL", Cost: 2}}} {
		input := base
		input.Rules = rules
		if _, err := service.SaveConfig(context.Background(), input); !errors.Is(err, ErrInvalidInput) {
			t.Fatalf("expected invalid config, got %v", err)
		}
	}
}

func TestAdjustmentRequiresAmountAndReason(t *testing.T) {
	service := NewService(&memoryRepository{})
	for _, input := range []AdjustmentInput{{Amount: 0, Description: "活动"}, {Amount: 10, Description: ""}} {
		if _, err := service.Adjust(context.Background(), "actor", 1, input); !errors.Is(err, ErrInvalidInput) {
			t.Fatalf("expected invalid adjustment, got %v", err)
		}
	}
}
