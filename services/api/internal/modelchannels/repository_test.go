package modelchannels

import (
	"fmt"
	"testing"
)

type resolvedModelScanner struct {
	destinationCount int
}

func (scanner *resolvedModelScanner) Scan(destinations ...interface{}) error {
	scanner.destinationCount = len(destinations)
	if len(destinations) != 35 {
		return fmt.Errorf("expected 35 destinations, got %d", len(destinations))
	}
	*destinations[4].(*[]byte) = []byte(`{"apiFormat":"openai","authMode":"bearer","modelCatalogPaths":["/v1/models"]}`)
	*destinations[31].(*[]byte) = []byte(`{"ratios":["16:9"],"minDuration":4,"maxDuration":30}`)
	return nil
}

func TestResolvedModelScanIncludesAdvancedConfiguration(t *testing.T) {
	scanner := &resolvedModelScanner{}
	channel, model, err := scanResolvedModel(scanner)
	if err != nil || scanner.destinationCount != 35 || channel.AdvancedConfig.AuthMode != "bearer" || len(model.CapabilityConfig.Ratios) != 1 || model.CapabilityConfig.MaxDuration != 30 {
		t.Fatalf("resolved model scan contract failed: count=%d err=%v", scanner.destinationCount, err)
	}
}
