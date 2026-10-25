package modelchannels

import "testing"

func TestProtocolRegistryMatchesVozebDefinitions(t *testing.T) {
	want := []string{"openai", "yumeng", "gemini", "seedance", "stable-diffusion", "volcengine-video", "sub2api", "newapi", "vozeb-recommended", "seedance-special", "compshare-minimax-h3", "custom", "globalaiopc", "compatible", "auto"}
	definitions := ProtocolDefinitions()
	if len(definitions) != len(want) {
		t.Fatalf("expected %d protocols, got %d", len(want), len(definitions))
	}
	for index, id := range want {
		if definitions[index].ID != id {
			t.Fatalf("protocol %d: expected %q, got %q", index, id, definitions[index].ID)
		}
		if len(definitions[index].Capabilities) == 0 {
			t.Fatalf("protocol %s has no capabilities", id)
		}
	}
}

func TestStrictProtocolNormalizesAdvancedConfiguration(t *testing.T) {
	definition, ok := FindProtocolDefinition("openai")
	if !ok {
		t.Fatal("OpenAI protocol missing")
	}
	advanced := normalizeAdvancedConfig(AdvancedConfig{APIFormat: "gemini", AuthMode: "none", ModelCatalogPaths: []string{"/wrong"}}, definition)
	if advanced.APIFormat != "openai" || advanced.AuthMode != "bearer" || len(advanced.ModelCatalogPaths) != 1 || advanced.ModelCatalogPaths[0] != "/v1/models" {
		t.Fatalf("strict protocol was not normalized: %#v", advanced)
	}
	if advanced.OperationConfigs["image"].CreatePath != "/images/generations" || advanced.OperationConfigs["video"].QueryPath != "/videos/:task_id" {
		t.Fatalf("protocol operations missing: %#v", advanced.OperationConfigs)
	}
}

func TestBuiltInProtocolsExposeDocumentedModels(t *testing.T) {
	for _, id := range []string{"yumeng", "seedance-special", "compshare-minimax-h3"} {
		definition, ok := FindProtocolDefinition(id)
		if !ok || len(definition.BuiltInModels) == 0 {
			t.Fatalf("protocol %s must expose built-in models", id)
		}
	}
}
