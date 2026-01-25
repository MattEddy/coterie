import SwiftUI

struct SettingsView: View {
    @AppStorage("supabaseUrl") private var supabaseUrl = ""
    @AppStorage("supabaseAnonKey") private var supabaseAnonKey = ""
    @AppStorage("syncEnabled") private var syncEnabled = false

    var body: some View {
        TabView {
            GeneralSettingsView()
                .tabItem {
                    Label("General", systemImage: "gear")
                }

            AISettingsView()
                .tabItem {
                    Label("AI", systemImage: "sparkles")
                }

            SyncSettingsView(
                supabaseUrl: $supabaseUrl,
                supabaseAnonKey: $supabaseAnonKey,
                syncEnabled: $syncEnabled
            )
            .tabItem {
                Label("Sync", systemImage: "arrow.triangle.2.circlepath")
            }
        }
        .frame(width: 450, height: 350)
    }
}

struct GeneralSettingsView: View {
    var body: some View {
        Form {
            Section {
                Text("Coterie")
                    .font(.headline)
                Text("Industry Intelligence")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section {
                Text("Version 1.0.0")
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
    }
}

struct AISettingsView: View {
    @State private var apiKey: String = ""
    @State private var hasExistingKey: Bool = false
    @State private var showingKey: Bool = false
    @State private var testStatus: TestStatus = .idle
    @AppStorage("useAIFiltering") private var useAIFiltering = true

    enum TestStatus {
        case idle
        case testing
        case success
        case failed(String)
    }

    var body: some View {
        Form {
            Section("Claude API") {
                if hasExistingKey {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                        Text("API key saved in Keychain")
                        Spacer()
                        Button("Remove") {
                            _ = KeychainHelper.shared.deleteAnthropicAPIKey()
                            hasExistingKey = false
                            apiKey = ""
                        }
                        .foregroundColor(.red)
                    }
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            if showingKey {
                                TextField("sk-ant-...", text: $apiKey)
                                    .textFieldStyle(.roundedBorder)
                            } else {
                                SecureField("sk-ant-...", text: $apiKey)
                                    .textFieldStyle(.roundedBorder)
                            }
                            Button(action: { showingKey.toggle() }) {
                                Image(systemName: showingKey ? "eye.slash" : "eye")
                            }
                            .buttonStyle(.borderless)
                        }

                        HStack {
                            Button("Save Key") {
                                if KeychainHelper.shared.setAnthropicAPIKey(apiKey) {
                                    hasExistingKey = true
                                    TierManager.shared.refreshTierStatus()
                                }
                            }
                            .disabled(apiKey.isEmpty || !apiKey.hasPrefix("sk-ant-"))

                            Button("Test Connection") {
                                testConnection()
                            }
                            .disabled(apiKey.isEmpty)

                            Spacer()

                            switch testStatus {
                            case .idle:
                                EmptyView()
                            case .testing:
                                ProgressView()
                                    .scaleEffect(0.7)
                            case .success:
                                Label("Connected", systemImage: "checkmark.circle.fill")
                                    .foregroundColor(.green)
                                    .font(.caption)
                            case .failed(let error):
                                Label(error, systemImage: "xmark.circle.fill")
                                    .foregroundColor(.red)
                                    .font(.caption)
                                    .lineLimit(1)
                            }
                        }
                    }
                }

                Link("Get an API key at console.anthropic.com",
                     destination: URL(string: "https://console.anthropic.com/")!)
                    .font(.caption)
            }

            Section("AI Features") {
                Toggle("Use AI for news filtering", isOn: $useAIFiltering)
                    .disabled(!hasExistingKey)

                Text("When enabled, Claude analyzes news articles to detect personnel changes, project setups, and deals more accurately than keyword matching.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if hasExistingKey {
                    HStack {
                        Image(systemName: "info.circle")
                            .foregroundColor(.blue)
                        Text("Estimated cost: ~$0.50-1.00/month for typical usage")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding()
        .onAppear {
            hasExistingKey = KeychainHelper.shared.getAnthropicAPIKey() != nil
        }
    }

    private func testConnection() {
        testStatus = .testing
        let keyToTest = apiKey.isEmpty ? (KeychainHelper.shared.getAnthropicAPIKey() ?? "") : apiKey

        Task {
            do {
                // Temporarily set the key for testing
                let originalKey = KeychainHelper.shared.getAnthropicAPIKey()
                _ = KeychainHelper.shared.setAnthropicAPIKey(keyToTest)

                let _ = try await ClaudeAPIService.shared.classifyArticle(
                    title: "Test: Netflix hires new executive",
                    description: "Testing API connection"
                )

                // Restore original key if we were just testing
                if let original = originalKey {
                    _ = KeychainHelper.shared.setAnthropicAPIKey(original)
                } else if apiKey.isEmpty {
                    _ = KeychainHelper.shared.deleteAnthropicAPIKey()
                }

                await MainActor.run {
                    testStatus = .success
                }
            } catch {
                await MainActor.run {
                    testStatus = .failed(error.localizedDescription)
                }
            }
        }
    }
}

struct SyncSettingsView: View {
    @Binding var supabaseUrl: String
    @Binding var supabaseAnonKey: String
    @Binding var syncEnabled: Bool

    var body: some View {
        Form {
            Section("Supabase Connection") {
                TextField("Project URL", text: $supabaseUrl)
                    .textFieldStyle(.roundedBorder)
                SecureField("Anon Key", text: $supabaseAnonKey)
                    .textFieldStyle(.roundedBorder)
            }

            Section {
                Toggle("Enable Sync", isOn: $syncEnabled)
                    .disabled(supabaseUrl.isEmpty || supabaseAnonKey.isEmpty)

                if syncEnabled {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                        Text("Connected")
                    }
                } else {
                    HStack {
                        Image(systemName: "circle")
                            .foregroundColor(.secondary)
                        Text("Not connected")
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Section {
                Text("Sync settings will be used to connect to a hosted Supabase instance for cloud backup and sharing.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
    }
}

#Preview {
    SettingsView()
}
