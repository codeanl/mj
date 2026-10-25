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
	if len(destinations) != 33 {
		return fmt.Errorf("expected 33 destinations, got %d", len(destinations))
	}
	*destinations[4].(*[]byte) = []byte(`{"apiFormat":"openai","authMode":"bearer","modelCatalogPaths":["/v1/models"]}`)
	return nil
}

func TestResolvedModelScanIncludesAdvancedConfiguration(t *testing.T) {
	scanner := &resolvedModelScanner{}
	channel, _, err := scanResolvedModel(scanner)
	if err != nil || scanner.destinationCount != 33 || channel.AdvancedConfig.AuthMode != "bearer" {
		t.Fatalf("resolved model scan contract failed: count=%d err=%v", scanner.destinationCount, err)
	}
}
