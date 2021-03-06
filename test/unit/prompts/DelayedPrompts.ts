import "../../support/polyfills/polyfills";
import test, { ExecutionContext } from "ava";
import sinon, { SinonSandbox } from 'sinon';
import nock from "nock";
import {
    TestEnvironment, HttpHttpsEnvironment, TestEnvironmentConfig
} from '../../support/sdk/TestEnvironment';
import { ConfigIntegrationKind, ServerAppConfig } from '../../../src/models/AppConfig';
import Random from "../../support/tester/Random";
import OneSignalApiBase from "../../../src/OneSignalApiBase";
import {
    stubMessageChannel, mockIframeMessaging, mockWebPushAnalytics, InitTestHelper
} from '../../support/tester/utils';
import { DynamicResourceLoader, ResourceLoadState } from "../../../src/services/DynamicResourceLoader";
import { ServiceWorkerManager } from "../../../src/managers/ServiceWorkerManager";
import { NotificationPermission } from "../../../src/models/NotificationPermission";
import { SessionManager } from "../../../src/managers/sessionManager/page/SessionManager";
import {
    stubServiceWorkerInstallation,
} from "../../support/tester/sinonSandboxUtils";
import LocalStorage from '../../../src/utils/LocalStorage';
import { PromptsManager } from '../../../src/managers/PromptsManager';
import InitHelper from '../../../src/helpers/InitHelper';

const sinonSandbox: SinonSandbox = sinon.sandbox.create();
const initTestHelper = new InitTestHelper(sinonSandbox);
const playerId = Random.getRandomUuid();
const appId = Random.getRandomUuid();

enum DelayedPromptType {
    Native = "native",
    Slidedown = "slidedown"
}

test.beforeEach(async () => {
    // tests use customizable beforeEach method defined below. add logic there if needed.
    mockWebPushAnalytics();
});

test.afterEach(function (_t: ExecutionContext) {
    sinonSandbox.restore();

    OneSignal._initCalled = false;
    OneSignal.__initAlreadyCalled = false;
    OneSignal._sessionInitAlreadyRunning = false;
});

/**
 * Unit Tests
 *
 * NOTE:
 *  - currently, internalShowDelayedPrompt encapsulates both types of delayed prompts for easy stubbing/spying since
 *    setTimeout doesn't work as intended in testing environment due to jsdom bugs
 */

test.serial(`Delayed Prompt: delayed prompt is shown after 1 page view if configured so`, async t => {
    await beforeTest(t);
    stubServiceWorkerInstallation(sinonSandbox);

    const nativeSpy = sinonSandbox.stub(PromptsManager.prototype, "internalShowDelayedPrompt").resolves();
    await initWithDelayedOptions(DelayedPromptType.Native, 0, 1);

    const pageViews = LocalStorage.getLocalPageViewCount();
    t.is(nativeSpy.callCount, 1);
    t.is(pageViews, 1);
});

test.serial(`Delayed Prompt: delayed prompt is shown after 0 page views if configured so`, async t => {
    await beforeTest(t);
    stubServiceWorkerInstallation(sinonSandbox);

    const nativeSpy = sinonSandbox.stub(PromptsManager.prototype, "internalShowDelayedPrompt").resolves();
    await initWithDelayedOptions(DelayedPromptType.Native, 0, 0);

    const pageViews = LocalStorage.getLocalPageViewCount();
    t.is(nativeSpy.callCount, 1);
    t.is(pageViews, 1);
});

test.serial(`Delayed Prompt: delayed prompt not shown if less than configured page views`, async t => {
    await beforeTest(t);
    stubServiceWorkerInstallation(sinonSandbox);

    OneSignal.on(OneSignal.EVENTS.PERMISSION_PROMPT_DISPLAYED, () => {
        t.fail();
    });

    const nativeSpy = sinonSandbox.stub(PromptsManager.prototype, "internalShowDelayedPrompt").resolves();
    // requires 2 page views
    await initWithDelayedOptions(DelayedPromptType.Native, 0, 2);

    const pageViews = LocalStorage.getLocalPageViewCount();
    t.is(nativeSpy.called, false);
    t.is(pageViews, 1);
});

test.serial(`Delayed Prompt: delayed prompt is shown after 3 page views if configured so`, async t => {
    await beforeTest(t);
    stubServiceWorkerInstallation(sinonSandbox);
    const nativeSpy = sinonSandbox.stub(PromptsManager.prototype, "internalShowDelayedPrompt").resolves();
    await initWithDelayedOptions(DelayedPromptType.Native, 0, 3);

    for(let i=0; i<2; i++) {
        OneSignal.context.pageViewManager.simulatePageNavigationOrRefresh();
        await InitHelper.internalInit();
    }

    const pageViews = OneSignal.context.pageViewManager.getLocalPageViewCount();
    t.is(pageViews, 3);
    t.is(nativeSpy.callCount, 1);
});

/** HELPERS */

/**
 * initWithDelayedOptions
 *  - type {string}: either 'native' or 'slidedown'
 *  - timeDelay {number}
 *  - pageViews {number}
 */
async function initWithDelayedOptions(type: DelayedPromptType, timeDelay: number, pageViews: number) {
    const promptOptions = getPromptOptions(type, timeDelay, pageViews);
    return OneSignal.init({
        appId,
        autoResubscribe: true,
        promptOptions
    });
}

async function beforeTest(
    t: ExecutionContext,
    customServerAppConfig?: ServerAppConfig
) {
    const testConfig: TestEnvironmentConfig = {
        httpOrHttps: HttpHttpsEnvironment.Https,
        integration: ConfigIntegrationKind.Custom,
        permission: NotificationPermission.Default
    };
    await TestEnvironment.initialize(testConfig);
    initTestHelper.mockBasicInitEnv(testConfig, customServerAppConfig);
    OneSignal.initialized = false;
    OneSignal.__doNotShowWelcomeNotification = true;

    sinonSandbox.stub(window.Notification, "permission").value(testConfig.permission || "default");

    const createPlayerPostStub = sinonSandbox.stub(OneSignalApiBase, "post")
        .resolves({ success: true, id: playerId });
    const onSessionStub = sinonSandbox.stub(SessionManager.prototype, "upsertSession").resolves();

    sinonSandbox.stub(DynamicResourceLoader.prototype, "loadSdkStylesheet").resolves(ResourceLoadState.Loaded);
    sinonSandbox.stub(ServiceWorkerManager.prototype, "installWorker").resolves();
    nock('https://onesignal.com')
        .get(/.*icon$/)
        .reply(200, (_uri: string, _requestBody: string) => {
            return { success: true };
        });

    if (testConfig.httpOrHttps === HttpHttpsEnvironment.Http) {
        stubMessageChannel(t);
        mockIframeMessaging(sinonSandbox);
    }
    return { createPlayerPostStub, onSessionStub };
}

function getPromptOptions(
    type: DelayedPromptType,
    timeDelay: number,
    pageViews: number
) {
    return {
        autoPrompt: true,
        [type]: {
            enabled: true,
            autoPrompt: true,
            timeDelay,
            pageViews
        }
    };
}
