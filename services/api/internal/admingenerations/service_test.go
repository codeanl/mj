package admingenerations

import "testing"

func TestParseAccountIDAcceptsPaddedPublicID(t *testing.T) {
	value, ok := parseAccountID("0001")
	if !ok || value != 1 {
		t.Fatalf("unexpected account ID: %d, %v", value, ok)
	}
	for _, input := range []string{"", "0000", "user"} {
		if _, ok := parseAccountID(input); ok {
			t.Fatalf("expected %q not to parse as an account ID", input)
		}
	}
}

func TestGenerationFiltersRejectUnknownValues(t *testing.T) {
	if validStatusFilter("waiting") || validKindFilter("audio") {
		t.Fatal("unknown generation filters must be rejected")
	}
}
