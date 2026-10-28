package admingenerations

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

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

func TestGenerationCursorRoundTrip(t *testing.T) {
	task := Task{ID: uuid.NewString(), CreatedAt: time.Now().UTC().Truncate(time.Microsecond)}
	value := encodeCursor(task)
	createdAt, id, err := DecodeCursor(value)
	if err != nil || createdAt == nil || id == nil || !createdAt.Equal(task.CreatedAt) || *id != task.ID {
		t.Fatalf("unexpected cursor round trip: %v %v %v", createdAt, id, err)
	}
	if _, _, err := DecodeCursor("invalid"); err == nil {
		t.Fatal("invalid cursor must be rejected")
	}
}
