import test from "ava";
import OneSignal from "../../../src/OneSignal";
import sinon, { SinonSandbox } from "sinon";
import { TestEnvironment } from "../../support/sdk/TestEnvironment";
import OneSignalApiShared from "../../../src/OneSignalApiShared";
import { OutcomeRequestData } from "../../../src/models/OutcomeRequestData";
import { DeliveryPlatformKind } from "../../../src/models/DeliveryPlatformKind";
import { SubscriptionStateKind } from "../../../src/models/SubscriptionStateKind";
import MainHelper from "../../../src/helpers/MainHelper";
import Log from "../../../src/libraries/Log";
import Database from "../../../src/services/Database";
import { NotificationClicked } from "../../../src/models/Notification";
import Random from "../../support/tester/Random";
import timemachine from "timemachine";
import { setupReceivedNotifications, OUTCOME_NAME, generateNotificationClicked } from '../helpers1/OutcomeHelper';

const sinonSandbox: SinonSandbox = sinon.sandbox.create();

test.beforeEach(async () => {
  await TestEnvironment.initialize();
  TestEnvironment.mockInternalOneSignal();

  const now = new Date().getTime();
  timemachine.config({
    timestamp: now,
  });
});

test.afterEach(() => {
  sinonSandbox.restore();
  timemachine.reset();
});

test("outcome name is required", async t => {
  const logSpy = sinonSandbox.stub(Log, "error");
  const apiSpy = sinonSandbox.stub(OneSignalApiShared, "sendOutcome").resolves();
  await (OneSignal as any).sendUniqueOutcome();
  t.is(logSpy.callCount, 1);
  t.is(apiSpy.callCount, 0);
});

test("reporting outcome requires the sdk to be initialized", async t => {
  OneSignal.initialized = false;

  const apiSpy = sinonSandbox.stub(OneSignalApiShared, "sendOutcome").resolves();
  sinonSandbox.stub(OneSignal, "privateIsPushNotificationsEnabled").resolves(true);
  sinonSandbox.stub(MainHelper, "getCurrentNotificationType").resolves(SubscriptionStateKind.Subscribed);
  const sendOutcomePromise = OneSignal.sendUniqueOutcome(OUTCOME_NAME);
  t.is(apiSpy.callCount, 0);

  OneSignal.emitter.emit(OneSignal.EVENTS.SDK_INITIALIZED);
  await sendOutcomePromise;

  t.is(apiSpy.callCount, 1);
});

test("reporting outcome should only work for subscribed users", async t => {
  const apiSpy = sinonSandbox.stub(OneSignalApiShared, "sendOutcome").resolves();
  sinonSandbox.stub(OneSignal, "privateIsPushNotificationsEnabled").resolves(false);
  await OneSignal.sendUniqueOutcome(OUTCOME_NAME);
  t.is(apiSpy.callCount, 0);
});

test("when outcome is unattributed and feature enabled it sends an api call",  async t => {
  const apiSpy = sinonSandbox.stub(OneSignalApiShared, "sendOutcome").resolves();
  sinonSandbox.stub(OneSignal, "privateIsPushNotificationsEnabled").resolves(true);
  sinonSandbox.stub(MainHelper, "getCurrentNotificationType").resolves(SubscriptionStateKind.Subscribed);
  await OneSignal.sendUniqueOutcome(OUTCOME_NAME);

  t.is(apiSpy.callCount, 1);
  const outcomeRequestData = apiSpy.getCall(0).args[0] as OutcomeRequestData;
  t.is(outcomeRequestData.app_id, OneSignal.config!.appId!);
  t.is(outcomeRequestData.id, OUTCOME_NAME);
  t.is(outcomeRequestData.weight, undefined);
  t.is(outcomeRequestData.notification_ids, undefined);
  t.is(outcomeRequestData.device_type, DeliveryPlatformKind.ChromeLike);
});

test("when outcome is unattributed and feature disabled there are no api calls",  async t => {
  OneSignal.config!.userConfig.outcomes!.unattributed.enabled = false;

  const apiSpy = sinonSandbox.stub(OneSignalApiShared, "sendOutcome");
  await OneSignal.sendUniqueOutcome(OUTCOME_NAME);

  t.is(apiSpy.callCount, 0);
});

test("when outcome is direct and feature enabled it sends an api call", async t => {
  const notificationClicked = generateNotificationClicked();
  await Database.put("NotificationClicked", notificationClicked);
  const apiSpy = sinonSandbox.stub(OneSignalApiShared, "sendOutcome").resolves();
  sinonSandbox.stub(OneSignal, "privateIsPushNotificationsEnabled").resolves(true);
  sinonSandbox.stub(MainHelper, "getCurrentNotificationType").resolves(SubscriptionStateKind.Subscribed);
  await OneSignal.sendUniqueOutcome(OUTCOME_NAME);

  t.is(apiSpy.callCount, 1);
  const outcomeRequestData = apiSpy.getCall(0).args[0] as OutcomeRequestData;
  t.is(outcomeRequestData.id, OUTCOME_NAME);
  t.is(outcomeRequestData.app_id, OneSignal.config!.userConfig.appId!);
  t.is(outcomeRequestData.notification_ids!.length, 1);
  t.is(outcomeRequestData.notification_ids![0], notificationClicked.notificationId);
  t.is(outcomeRequestData.device_type, DeliveryPlatformKind.ChromeLike);
  t.is(outcomeRequestData.direct, true);
});

test("when outcome is direct and feature disabled there are no api calls", async t => {
  OneSignal.config!.userConfig.outcomes!.direct.enabled = false;
  OneSignal.config!.userConfig.outcomes!.indirect.enabled = false;
  OneSignal.config!.userConfig.outcomes!.unattributed.enabled = false;

  const notificationClicked = generateNotificationClicked();
  await Database.put("NotificationClicked", notificationClicked);
  const apiSpy = sinonSandbox.stub(OneSignalApiShared, "sendOutcome").resolves();
  sinonSandbox.stub(OneSignal, "privateIsPushNotificationsEnabled").resolves(true);
  sinonSandbox.stub(MainHelper, "getCurrentNotificationType").resolves(SubscriptionStateKind.Subscribed);
  await OneSignal.sendUniqueOutcome(OUTCOME_NAME);

  t.is(apiSpy.callCount, 0);
});

test("when outcome is indirect and feature enabled it sends an api call", async t => {
  const receivedNotificationIdsWithinTimeframe = await setupReceivedNotifications();

  const apiSpy = sinonSandbox.stub(OneSignalApiShared, "sendOutcome").resolves();
  sinonSandbox.stub(OneSignal, "privateIsPushNotificationsEnabled").resolves(true);
  sinonSandbox.stub(MainHelper, "getCurrentNotificationType").resolves(SubscriptionStateKind.Subscribed);
  await OneSignal.sendUniqueOutcome(OUTCOME_NAME);

  t.is(apiSpy.callCount, 1);
  const outcomeRequestData = apiSpy.getCall(0).args[0] as OutcomeRequestData;
  t.is(outcomeRequestData.id, OUTCOME_NAME);
  t.is(outcomeRequestData.app_id, OneSignal.config!.userConfig.appId!);
  t.is(outcomeRequestData.notification_ids!.length, receivedNotificationIdsWithinTimeframe.length);
  outcomeRequestData.notification_ids!.sort();
  receivedNotificationIdsWithinTimeframe.sort();
  t.deepEqual(outcomeRequestData.notification_ids!, receivedNotificationIdsWithinTimeframe);
  t.is(outcomeRequestData.device_type, DeliveryPlatformKind.ChromeLike);
  t.is(outcomeRequestData.direct, false);
});

test("when outcome is indirect and feature disabled there are no api calls", async t => {
  OneSignal.config!.userConfig.outcomes!.direct.enabled = false;
  OneSignal.config!.userConfig.outcomes!.indirect.enabled = false;
  OneSignal.config!.userConfig.outcomes!.unattributed.enabled = false;

  await setupReceivedNotifications();
  const apiSpy = sinonSandbox.stub(OneSignalApiShared, "sendOutcome").resolves();
  sinonSandbox.stub(OneSignal, "privateIsPushNotificationsEnabled").resolves(true);
  sinonSandbox.stub(MainHelper, "getCurrentNotificationType").resolves(SubscriptionStateKind.Subscribed);
  await OneSignal.sendUniqueOutcome(OUTCOME_NAME);

  t.is(apiSpy.callCount, 0);
});


test("when direct outcome is sent twice, there is only one api call", async t => {
  const notificationClicked = generateNotificationClicked();
  await Database.put("NotificationClicked", notificationClicked);
  const apiSpy = sinonSandbox.stub(OneSignalApiShared, "sendOutcome").resolves();
  const logSpy = sinonSandbox.stub(Log, "warn");
  sinonSandbox.stub(OneSignal, "privateIsPushNotificationsEnabled").resolves(true);
  sinonSandbox.stub(MainHelper, "getCurrentNotificationType").resolves(SubscriptionStateKind.Subscribed);
  await OneSignal.sendUniqueOutcome(OUTCOME_NAME);
  await OneSignal.sendUniqueOutcome(OUTCOME_NAME);

  t.is(apiSpy.callCount, 1);
  t.is(logSpy.callCount, 1);
});

test("when indirect outcome is sent twice, there is only one api call", async t => {
  await setupReceivedNotifications();
  const apiSpy = sinonSandbox.stub(OneSignalApiShared, "sendOutcome").resolves();
  const logSpy = sinonSandbox.stub(Log, "warn");
  sinonSandbox.stub(OneSignal, "privateIsPushNotificationsEnabled").resolves(true);
  sinonSandbox.stub(MainHelper, "getCurrentNotificationType").resolves(SubscriptionStateKind.Subscribed);
  await OneSignal.sendUniqueOutcome(OUTCOME_NAME);
  await OneSignal.sendUniqueOutcome(OUTCOME_NAME);

  t.is(apiSpy.callCount, 1);
  t.is(logSpy.callCount, 1);
});

test("indirect outcome sent -> receive new notification -> indirect outcome sent, there are two api calls", async t => {
  await setupReceivedNotifications();
  const apiSpy = sinonSandbox.stub(OneSignalApiShared, "sendOutcome").resolves();
  const logSpy = sinonSandbox.stub(Log, "warn");
  sinonSandbox.stub(OneSignal, "privateIsPushNotificationsEnabled").resolves(true);
  sinonSandbox.stub(MainHelper, "getCurrentNotificationType").resolves(SubscriptionStateKind.Subscribed);
  await OneSignal.sendUniqueOutcome(OUTCOME_NAME);
  await setupReceivedNotifications();
  await OneSignal.sendUniqueOutcome(OUTCOME_NAME);

  t.is(apiSpy.callCount, 2);
  t.is(logSpy.callCount, 0);
});

test("when unattributed outcome is sent twice, there is only one api call", async t => {
  const apiSpy = sinonSandbox.stub(OneSignalApiShared, "sendOutcome").resolves();
  const logSpy = sinonSandbox.stub(Log, "warn");
  sinonSandbox.stub(OneSignal, "privateIsPushNotificationsEnabled").resolves(true);
  sinonSandbox.stub(MainHelper, "getCurrentNotificationType").resolves(SubscriptionStateKind.Subscribed);
  await OneSignal.sendUniqueOutcome(OUTCOME_NAME);
  await OneSignal.sendUniqueOutcome(OUTCOME_NAME);

  t.is(apiSpy.callCount, 1);
  t.is(logSpy.callCount, 1);
});