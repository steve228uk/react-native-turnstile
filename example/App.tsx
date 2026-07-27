import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Turnstile,
  type TurnstileAppearance,
  type TurnstileExecution,
  type TurnstileRefreshExpired,
  type TurnstileRefreshTimeout,
  type TurnstileRef,
  type TurnstileRetry,
  type TurnstileSize,
  type TurnstileStatus,
  type TurnstileTheme,
  type TurnstileWidgetMode,
} from '@steve228uk/react-native-turnstile';

import {
  ActionButton,
  ChoiceRow,
  InputRow,
  Section,
  ToggleRow,
} from './src/components/Controls';
import {
  TEST_SCENARIOS,
  getScenario,
  type TestScenario,
} from './src/harness/scenarios';
import {
  SubmissionGate,
  describeToken,
  normaliseHeight,
} from './src/harness/state';
import {
  verifyWithDevelopmentServer,
  type SiteverifyResponse,
} from './src/harness/siteverify';
import { palette } from './src/theme';

interface LogEntry {
  id: number;
  time: string;
  event: string;
  detail?: string;
}

const expoEnvironment = process.env as Record<string, string | undefined>;

const monospace = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

const choices = <T extends string>(...values: readonly T[]) =>
  values.map((value) => ({ value, label: value }));

const parseNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function formatLogDetail(detail: unknown): string | undefined {
  if (detail === undefined) {
    return undefined;
  }

  return typeof detail === 'string' ? detail : JSON.stringify(detail);
}

function getStatusTone(
  status: TurnstileStatus | 'not-rendered',
  expired: boolean,
  interactive: boolean,
): string {
  if (status === 'verified') {
    return palette.green;
  }
  if (status === 'error' || expired) {
    return palette.red;
  }
  if (interactive) {
    return palette.amber;
  }
  return palette.blue;
}

function TokenAge({ receivedAt }: { receivedAt: Date }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds(
        Math.max(0, Math.floor((Date.now() - receivedAt.getTime()) / 1000)),
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [receivedAt]);

  return <Text>{seconds}s</Text>;
}

export default function App() {
  const widgetRef = useRef<TurnstileRef>(null);
  const submitGate = useRef(new SubmissionGate()).current;
  const eventId = useRef(0);
  const configuredSiteKey =
    expoEnvironment.EXPO_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;
  const configuredScenario = useMemo<TestScenario | null>(
    () =>
      configuredSiteKey
        ? {
            id: 'configured',
            label: 'Configured real key',
            siteKey: configuredSiteKey,
            widgetMode: 'managed',
            expected: 'Uses the sitekey supplied through the Expo environment.',
            serverHint:
              'Use the matching server-side secret for Siteverify testing.',
          }
        : null,
    [configuredSiteKey],
  );
  const scenarios = useMemo(
    () =>
      configuredScenario
        ? [configuredScenario, ...TEST_SCENARIOS]
        : [...TEST_SCENARIOS],
    [configuredScenario],
  );

  const [scenarioId, setScenarioId] = useState<TestScenario['id']>(
    configuredScenario ? 'configured' : 'visible-pass',
  );
  const scenario = useMemo(
    () => getScenario(scenarioId, scenarios),
    [scenarioId, scenarios],
  );
  const [widgetMode, setWidgetMode] = useState<TurnstileWidgetMode>(
    scenario.widgetMode,
  );
  const [theme, setTheme] = useState<TurnstileTheme>('auto');
  const [size, setSize] = useState<TurnstileSize>('normal');
  const [appearance, setAppearance] = useState<TurnstileAppearance>('always');
  const [execution, setExecution] = useState<TurnstileExecution>('render');
  const [language, setLanguage] = useState('auto');
  const [action, setAction] = useState('harness-submit');
  const [cData, setCData] = useState('rn-example');
  const [tabIndex, setTabIndex] = useState('0');
  const [retry, setRetry] = useState<TurnstileRetry>('auto');
  const [retryInterval, setRetryInterval] = useState('8000');
  const [refreshExpired, setRefreshExpired] =
    useState<TurnstileRefreshExpired>('auto');
  const [refreshTimeout, setRefreshTimeout] =
    useState<TurnstileRefreshTimeout>('auto');
  const [responseField, setResponseField] = useState(false);
  const [autoHeight, setAutoHeight] = useState(true);
  const [fixedHeightEnabled, setFixedHeightEnabled] = useState(false);
  const [fixedHeight, setFixedHeight] = useState('90');
  const [minHeight, setMinHeight] = useState('0');
  const [maxHeight, setMaxHeight] = useState('500');
  const [baseUrl, setBaseUrl] = useState(
    expoEnvironment.EXPO_PUBLIC_TURNSTILE_BASE_URL?.trim() ||
      'https://localhost',
  );
  const [testID, setTestID] = useState('turnstile-harness-widget');
  const [nativeID, setNativeID] = useState('turnstile-widget');
  const [accessibilityLabel, setAccessibilityLabel] = useState(
    'Cloudflare security challenge',
  );
  const [accessibilityHint, setAccessibilityHint] = useState(
    'Complete the challenge before sending the test form',
  );

  const [mountKey, setMountKey] = useState(0);
  const [status, setStatus] = useState<TurnstileStatus | 'not-rendered'>(
    'not-rendered',
  );
  const [interactive, setInteractive] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenReceivedAt, setTokenReceivedAt] = useState<Date | null>(null);
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verification, setVerification] = useState<SiteverifyResponse | null>(
    null,
  );
  const [events, setEvents] = useState<LogEntry[]>([]);

  const log = useCallback((event: string, detail?: unknown) => {
    const entry: LogEntry = {
      id: ++eventId.current,
      time: new Date().toLocaleTimeString(),
      event,
      detail: formatLogDetail(detail),
    };
    setEvents((current) => [entry, ...current].slice(0, 50));
  }, []);

  const clearToken = useCallback(() => {
    setToken(null);
    setTokenReceivedAt(null);
    setExpired(false);
  }, []);

  const receiveToken = useCallback(
    (nextToken: string | null) => {
      setToken(nextToken);
      setTokenReceivedAt(nextToken ? new Date() : null);
      setExpired(false);
      setVerification(null);
      log(
        'token-change',
        nextToken ? `${nextToken.length} characters` : 'cleared',
      );
    },
    [log],
  );

  const chooseScenario = (nextId: TestScenario['id']) => {
    const next = getScenario(nextId, scenarios);
    setScenarioId(nextId);
    setWidgetMode(next.widgetMode);
    clearToken();
    setVerification(null);
    setMountKey((value) => value + 1);
    log('scenario', next.label);
  };

  const invoke = async (name: 'render' | 'execute' | 'reset' | 'remove') => {
    try {
      await widgetRef.current?.[name]();
      if (name === 'reset' || name === 'remove') clearToken();
      log(`ref.${name}`);
    } catch (error) {
      log(`ref.${name}.error`, String(error));
    }
  };

  const inspectRef = async () => {
    try {
      const [response, responseExpired] = await Promise.all([
        widgetRef.current?.getResponse(),
        widgetRef.current?.isExpired(),
      ]);
      log('ref.inspect', {
        responseLength: response?.length ?? 0,
        isExpired: responseExpired ?? null,
      });
    } catch (error) {
      log('ref.inspect.error', String(error));
    }
  };

  const reRender = () => {
    clearToken();
    setVerification(null);
    setMeasuredHeight(null);
    setMountKey((value) => value + 1);
    log('react.re-render');
  };

  const submit = async () => {
    if (submitGate.inFlight) {
      log('submit.blocked', 'in-flight');
      return;
    }

    setSubmitting(true);
    setVerification(null);

    try {
      const result = await submitGate.submit({
        token,
        expired,
        verify: (singleUseToken) =>
          verifyWithDevelopmentServer({
            endpoint: expoEnvironment.EXPO_PUBLIC_SITEVERIFY_URL ?? '',
            token: singleUseToken,
          }),
        reset: async () => {
          await widgetRef.current?.reset();
          clearToken();
          log('submit.reset', 'single-use token cleared');
        },
      });

      if (!result.ok) {
        log('submit.blocked', result.reason);
        return;
      }

      setVerification(result.value);
      log(
        'siteverify',
        result.value.success
          ? 'accepted'
          : result.value['error-codes']?.join(', ') || 'rejected',
      );
    } catch (error) {
      setVerification({
        success: false,
        messages: [error instanceof Error ? error.message : String(error)],
      });
      log('siteverify.error', String(error));
    } finally {
      setSubmitting(false);
    }
  };

  const numericMin = parseNumber(minHeight, 0);
  const numericMax = parseNumber(maxHeight, 500);
  const numericFixed = normaliseHeight(
    parseNumber(fixedHeight, 90),
    numericMin,
    numericMax,
  );
  const tokenMetadata =
    token && tokenReceivedAt ? describeToken(token, tokenReceivedAt) : null;
  const canSubmit = Boolean(token && !expired && !submitting);
  const statusTone = getStatusTone(status, expired, interactive);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerMark}>
            <View style={styles.headerMarkInner} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>DEVICE LAB / SDK 57</Text>
            <Text style={styles.heading}>Turnstile signal bench</Text>
            <Text style={styles.lede}>
              Exercise rendering, lifecycle, sizing, accessibility, and
              single-use server verification from one instrumented screen.
            </Text>
          </View>
        </View>

        <View style={styles.statusRail}>
          <View
            style={[styles.statusBeacon, { backgroundColor: statusTone }]}
          />
          <View style={styles.statusItem}>
            <Text style={styles.dataLabel}>STATUS</Text>
            <Text style={styles.dataValue}>{String(status)}</Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.dataLabel}>HEIGHT</Text>
            <Text style={styles.dataValue}>
              {measuredHeight === null ? '—' : `${measuredHeight}px`}
            </Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.dataLabel}>TOKEN</Text>
            <Text style={styles.dataValue}>
              {tokenMetadata ? `${tokenMetadata.length} chars` : 'none'}
            </Text>
          </View>
        </View>

        <Section
          eyebrow="Deterministic inputs"
          title="Cloudflare test scenario"
        >
          <ChoiceRow
            label="Scenario"
            onChange={chooseScenario}
            options={scenarios.map(({ id, label }) => ({
              value: id,
              label,
            }))}
            value={scenarioId}
          />
          <View style={styles.note}>
            <Text style={styles.noteTitle}>{scenario.expected}</Text>
            <Text style={styles.noteText}>{scenario.serverHint}</Text>
            <Text selectable style={styles.code}>
              {scenario.siteKey}
            </Text>
          </View>
          <ChoiceRow
            label="Display hint"
            onChange={setWidgetMode}
            options={[
              { value: 'managed', label: 'Managed' },
              { value: 'invisible', label: 'Invisible' },
              { value: 'non-interactive', label: 'Non-interactive' },
            ]}
            value={widgetMode}
          />
          <ChoiceRow
            label="Theme"
            onChange={setTheme}
            options={choices('auto', 'light', 'dark')}
            value={theme}
          />
          <ChoiceRow
            label="Size"
            onChange={setSize}
            options={choices('normal', 'compact', 'flexible')}
            value={size}
          />
          <ChoiceRow
            label="Appearance"
            onChange={setAppearance}
            options={choices('always', 'execute', 'interaction-only')}
            value={appearance}
          />
          <ChoiceRow
            label="Execution"
            onChange={setExecution}
            options={choices('render', 'execute')}
            value={execution}
          />
          <InputRow
            label="Language"
            onChangeText={setLanguage}
            value={language}
          />
          <InputRow
            label="Base URL"
            onChangeText={setBaseUrl}
            value={baseUrl}
          />
          <InputRow label="Action" onChangeText={setAction} value={action} />
          <InputRow label="cData" onChangeText={setCData} value={cData} />
          <InputRow
            keyboardType="number-pad"
            label="Tab index"
            onChangeText={setTabIndex}
            value={tabIndex}
          />
        </Section>

        <Section eyebrow="Recovery policy" title="Retry and refresh">
          <ChoiceRow
            label="Retry"
            onChange={setRetry}
            options={choices('auto', 'never')}
            value={retry}
          />
          <InputRow
            keyboardType="number-pad"
            label="Retry interval (ms)"
            onChangeText={setRetryInterval}
            value={retryInterval}
          />
          <ChoiceRow
            label="Refresh expired"
            onChange={setRefreshExpired}
            options={choices('auto', 'manual', 'never')}
            value={refreshExpired}
          />
          <ChoiceRow
            label="Refresh timeout"
            onChange={setRefreshTimeout}
            options={choices('auto', 'manual', 'never')}
            value={refreshTimeout}
          />
          <ToggleRow
            hint="Ask Turnstile to create the hidden response field."
            label="Response field"
            onChange={setResponseField}
            value={responseField}
          />
        </Section>

        <Section eyebrow="Layout probe" title="Height constraints">
          <ToggleRow
            hint="Track content height reported by the WebView document."
            label="Auto height"
            onChange={(value) => {
              setAutoHeight(value);
              if (value) setFixedHeightEnabled(false);
            }}
            value={autoHeight}
          />
          <ToggleRow
            hint="Apply an explicit React Native container height."
            label="Fixed height"
            onChange={(value) => {
              setFixedHeightEnabled(value);
              if (value) setAutoHeight(false);
            }}
            value={fixedHeightEnabled}
          />
          <InputRow
            keyboardType="number-pad"
            label="Fixed height"
            onChangeText={setFixedHeight}
            value={fixedHeight}
          />
          <View style={styles.pairedInputs}>
            <View style={styles.pairedInput}>
              <InputRow
                keyboardType="number-pad"
                label="Minimum"
                onChangeText={setMinHeight}
                value={minHeight}
              />
            </View>
            <View style={styles.pairedInput}>
              <InputRow
                keyboardType="number-pad"
                label="Maximum"
                onChangeText={setMaxHeight}
                value={maxHeight}
              />
            </View>
          </View>
          <Text style={styles.hintText}>
            Applied fixed height: {numericFixed}px · measured:{' '}
            {measuredHeight ?? 'waiting'}
          </Text>
        </Section>

        <Section eyebrow="Forwarding probe" title="Native identity">
          <InputRow label="testID" onChangeText={setTestID} value={testID} />
          <InputRow
            label="nativeID"
            onChangeText={setNativeID}
            value={nativeID}
          />
          <InputRow
            label="Accessibility label"
            onChangeText={setAccessibilityLabel}
            value={accessibilityLabel}
          />
          <InputRow
            label="Accessibility hint"
            onChangeText={setAccessibilityHint}
            value={accessibilityHint}
          />
        </Section>

        <Section eyebrow="Live WebView" title="Challenge surface">
          <View style={styles.actionGrid}>
            <ActionButton
              label="render()"
              onPress={() => void invoke('render')}
            />
            <ActionButton
              label="execute()"
              onPress={() => void invoke('execute')}
            />
            <ActionButton
              label="reset()"
              onPress={() => void invoke('reset')}
            />
            <ActionButton
              label="remove()"
              onPress={() => void invoke('remove')}
            />
            <ActionButton label="Re-render" onPress={reRender} />
            <ActionButton
              label="Inspect ref"
              onPress={() => void inspectRef()}
            />
          </View>

          <View style={styles.widgetFrame}>
            <Turnstile
              key={mountKey}
              ref={widgetRef}
              accessibilityHint={accessibilityHint}
              accessibilityLabel={accessibilityLabel}
              accessibilityRole="none"
              action={action || undefined}
              appearance={appearance}
              autoHeight={autoHeight}
              baseUrl={baseUrl}
              cData={cData || undefined}
              execution={execution}
              language={language || 'auto'}
              maxHeight={numericMax}
              minHeight={numericMin}
              nativeID={nativeID}
              onAfterInteractive={() => log('after-interactive')}
              onBeforeInteractive={() => log('before-interactive')}
              onError={(error) =>
                log('error', { code: error.code, message: error.message })
              }
              onExpire={() => {
                setExpired(true);
                log('expire');
              }}
              onHeightChange={(height) => {
                setMeasuredHeight(height);
                log('height', height);
              }}
              onInteractiveChange={(value) => {
                setInteractive(value);
                log('interactive', value);
              }}
              onReady={(widgetId) => log('ready', widgetId)}
              onStatusChange={(value) => {
                setStatus(value);
                log('status', value);
              }}
              onTimeout={() => {
                setExpired(true);
                log('timeout');
              }}
              onTokenChange={receiveToken}
              onUnsupported={() => log('unsupported')}
              onVerify={(verifiedToken) =>
                log('verify', `${verifiedToken.length} characters`)
              }
              refreshExpired={refreshExpired}
              refreshTimeout={refreshTimeout}
              responseField={responseField}
              retry={retry}
              retryInterval={parseNumber(retryInterval, 8000)}
              siteKey={scenario.siteKey}
              size={size}
              style={[
                styles.widget,
                fixedHeightEnabled && { height: numericFixed },
              ]}
              tabIndex={parseNumber(tabIndex, 0)}
              testID={testID}
              theme={theme}
              widgetMode={widgetMode}
            />
          </View>
        </Section>

        <Section eyebrow="Single-use boundary" title="Server verification">
          <View style={styles.tokenPanel}>
            <Text style={styles.dataLabel}>TOKEN METADATA</Text>
            {tokenMetadata && tokenReceivedAt ? (
              <>
                <Text selectable style={styles.tokenPreview}>
                  {tokenMetadata.preview}
                </Text>
                <Text style={styles.hintText}>
                  {tokenMetadata.length} characters · received{' '}
                  <TokenAge
                    key={tokenReceivedAt.toISOString()}
                    receivedAt={tokenReceivedAt}
                  />{' '}
                  ago
                </Text>
                <Text selectable style={styles.timestamp}>
                  {tokenMetadata.receivedAt}
                </Text>
              </>
            ) : (
              <Text style={styles.emptyText}>
                No token. Render or execute a passing scenario.
              </Text>
            )}
          </View>
          <ActionButton
            disabled={!canSubmit}
            emphasis
            label={submitting ? 'Verifying…' : 'Verify single-use token'}
            onPress={() => void submit()}
          />
          <Text style={styles.hintText}>
            The synchronous in-flight lock blocks rapid duplicate submissions.
            Every attempt resets the widget and clears the local token.
          </Text>
          {verification ? (
            <View
              style={[
                styles.result,
                verification.success ? styles.resultPass : styles.resultFail,
              ]}
            >
              <Text style={styles.resultTitle}>
                {verification.success ? 'Accepted' : 'Rejected'}
              </Text>
              <Text selectable style={styles.code}>
                {JSON.stringify(verification, null, 2)}
              </Text>
            </View>
          ) : null}
        </Section>

        <Section eyebrow="Callback stream" title="Event log">
          <ActionButton label="Clear log" onPress={() => setEvents([])} />
          {events.length === 0 ? (
            <Text style={styles.emptyText}>
              Events will appear here newest first.
            </Text>
          ) : (
            <View style={styles.log}>
              {events.map((entry) => (
                <View key={entry.id} style={styles.logRow}>
                  <Text style={styles.logTime}>{entry.time}</Text>
                  <View style={styles.logCopy}>
                    <Text style={styles.logEvent}>{entry.event}</Text>
                    {entry.detail ? (
                      <Text selectable style={styles.logDetail}>
                        {entry.detail}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          )}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: palette.canvas,
    flex: 1,
  },
  content: {
    gap: 16,
    padding: 16,
    paddingBottom: 56,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 4,
    paddingTop: 10,
  },
  headerMark: {
    alignItems: 'center',
    backgroundColor: palette.blue,
    borderRadius: 17,
    height: 52,
    justifyContent: 'center',
    marginTop: 2,
    transform: [{ rotate: '-7deg' }],
    width: 52,
  },
  headerMarkInner: {
    borderColor: palette.paper,
    borderRadius: 11,
    borderWidth: 3,
    height: 26,
    width: 26,
  },
  headerCopy: {
    flex: 1,
  },
  kicker: {
    color: palette.blue,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  heading: {
    color: palette.ink,
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -0.7,
    marginTop: 3,
  },
  lede: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
  },
  statusRail: {
    alignItems: 'center',
    backgroundColor: palette.ink,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 13,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  statusBeacon: {
    borderRadius: 7,
    height: 14,
    width: 14,
  },
  statusItem: {
    flex: 1,
    gap: 2,
  },
  dataLabel: {
    color: '#8DA1BF',
    fontFamily: monospace,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  dataValue: {
    color: palette.paper,
    fontFamily: monospace,
    fontSize: 12,
    fontWeight: '700',
  },
  note: {
    backgroundColor: '#F3F7FC',
    borderLeftColor: palette.cyan,
    borderLeftWidth: 3,
    borderRadius: 9,
    gap: 5,
    padding: 12,
  },
  noteTitle: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  noteText: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  code: {
    color: '#29415F',
    fontFamily: monospace,
    fontSize: 10,
    lineHeight: 16,
  },
  pairedInputs: {
    flexDirection: 'row',
    gap: 10,
  },
  pairedInput: {
    flex: 1,
  },
  hintText: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  widgetFrame: {
    backgroundColor: '#F5F8FC',
    borderColor: palette.line,
    borderRadius: 13,
    borderStyle: 'dashed',
    borderWidth: 1,
    overflow: 'hidden',
    padding: 8,
  },
  widget: {
    alignSelf: 'stretch',
  },
  tokenPanel: {
    backgroundColor: palette.ink,
    borderRadius: 12,
    gap: 6,
    padding: 14,
  },
  tokenPreview: {
    color: '#79E3EC',
    fontFamily: monospace,
    fontSize: 16,
    fontWeight: '800',
  },
  timestamp: {
    color: '#AFC0D8',
    fontFamily: monospace,
    fontSize: 10,
  },
  emptyText: {
    color: palette.muted,
    fontSize: 13,
    fontStyle: 'italic',
  },
  result: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 13,
  },
  resultPass: {
    backgroundColor: '#EAF8F0',
    borderColor: '#8ED2AB',
  },
  resultFail: {
    backgroundColor: '#FFF0F0',
    borderColor: '#E9A2A2',
  },
  resultTitle: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  log: {
    gap: 0,
  },
  logRow: {
    borderTopColor: palette.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
  },
  logTime: {
    color: '#8291A8',
    fontFamily: monospace,
    fontSize: 10,
    width: 70,
  },
  logCopy: {
    flex: 1,
    gap: 3,
  },
  logEvent: {
    color: palette.ink,
    fontFamily: monospace,
    fontSize: 11,
    fontWeight: '800',
  },
  logDetail: {
    color: palette.muted,
    fontFamily: monospace,
    fontSize: 10,
    lineHeight: 15,
  },
});
