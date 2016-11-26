/* @flow */

import { $ } from '../vendor';
import * as Options from '../core/options';
import * as Modules from '../core/modules';
import { Module } from '../core/module';
import { i18n } from '../environment';
import * as Notifications from './notifications';
import * as SettingsNavigation from './settingsNavigation';

export const module: Module<*> = new Module('resPenaltyBox');
export const MIN_PENALTY = 1;
export const MAX_PENALTY = 100;

module.moduleName = 'resPenaltyBoxName';
module.category = 'coreCategory';
module.description = 'resPenaltyBoxDesc';
module.options = {
	delayFeatures: {
		type: 'boolean',
		value: true,
		description: 'resPenaltyBoxDelayFeaturesDesc',
	},
	suspendFeatures: {
		type: 'boolean',
		value: false,
		description: 'resPenaltyBoxSuspendFeaturesDesc',
	},
	features: {
		description: 'resPenaltyBoxFeaturesDesc',
		type: 'table',
		advanced: true,
		addRowText: 'manually register feature',
		fields: [
			{
				name: 'moduleID',
				type: 'text',
			},
			{
				name: 'featureID',
				type: 'text',
			},
			{
				name: 'monitoring',
				type: 'boolean',
				value: true,
			},
			{
				name: 'penalty',
				type: 'text',
				value: 0,
			},
		],
		value: [],
	},
};

export function alterFeaturePenalty(moduleID: string, featureID: string, valueDelta: number) {
	if (isNaN(parseInt(valueDelta, 10))) {
		console.warn('Could not alter penalty for', moduleID, featureID, ' - bad value:', valueDelta);
		return MIN_PENALTY;
	}
	if (!Modules.isEnabled(module.moduleID)) return MIN_PENALTY;
	const value = getOrAddFeatures(moduleID, featureID);
	if (!value.monitoring) return MIN_PENALTY;
	value.penalty = Math.min(Math.max(value.penalty + valueDelta, MIN_PENALTY), MAX_PENALTY);
	Options.set(module, 'features', module.options.features.value);
	if (value.penalty >= MAX_PENALTY) {
		suspendFeature(moduleID, featureID);
	}
	return value.penalty;
}

function stopMonitoringFeature(moduleID, featureID) {
	const value = getOrAddFeatures(moduleID, featureID);
	value.monitoring = false;
	value.penalty = MIN_PENALTY;
	Options.set(module, 'features', module.options.features.value);
}

export function getFeaturePenalty(moduleID: string, featureID: string) {
	if (!Modules.isEnabled(module.moduleID)) return MIN_PENALTY;
	const value = getOrAddFeatures(moduleID, featureID);
	if (!value.monitoring) return MIN_PENALTY;
	return value.penalty;
}

export function penalizedDelay(moduleID: string, featureID: string, delay: number) {
	if (!module.options.delayFeatures.value) {
		return delay.value;
	}
	if (delay.value !== delay.default) {
		return delay.value;
	}
	const penalty = getFeaturePenalty(moduleID, featureID);
	if (!penalty || MIN_PENALTY >= penalty) {
		return delay.value;
	}

	const max = delay.penalizedValue || delay.value * 6;
	const initial = delay.default;
	const position = penalty / 100;

	return Math.min(max, (max - initial) * position + initial);
}

function getOrAddFeatures(moduleID, featureID) {
	const value = Options.table.getMatchingValueOrAdd(module, 'features', { moduleID, featureID });
	const obj = Options.table.mapValueToObject(module.options.features, value);
	obj.penalty = parseInt(obj.penalty, 10) || 0;
	return obj;
}

async function suspendFeature(moduleID, featureID) {
	if (!module.options.suspendFeatures.value) {
		return;
	}

	const featureModule = Modules.get(moduleID);
	const optionKey = featureID;
	const option = featureModule.options[optionKey];
	if (!option) {
		console.warn('Could not find option', moduleID, featureID, optionKey);
		return;
	}
	if (option.type !== 'boolean') {
		console.warn(`${module.moduleID} could not disable option`, moduleID, featureID, optionKey);
		return;
	}
	const oldValue = option.value;
	const newValue = !option.value;

	Options.set(moduleID, optionKey, newValue);
	const featureOptionLink = SettingsNavigation.makeUrlHashLink(moduleID, optionKey);
	const notification = await Notifications.showNotification({
		moduleID: module.moduleID,
		optionKey: 'suspendFeatures',
		header: i18n('resPenaltyBoxSuspendFeaturesNotificationHeader'),
		message: i18n('resPenaltyBoxSuspendFeaturesNotificationMessage', featureOptionLink) +
			 `<p><a class="RESNotificationButtonBlue" id="resPenaltyBoxEnableFeature" href="javascript:void 0">${ i18n('resPenaltyBoxSuspendFeaturesUndoButton') }</a></p>`,
	});

	$(notification.element).on('click', '#resPenaltyBoxEnableFeature', () => {
		Options.set(moduleID, optionKey, oldValue);
		stopMonitoringFeature(moduleID, featureID);
		notification.close();
		Notifications.showNotification({
			moduleID: module.moduleID,
			optionKey: 'suspendFeatures',
			header: i18n('resPenaltyBoxSuspendFeaturesRevertNotificationHeader'),
			message: i18n('resPenaltyBoxSuspendFeaturesRevertNotificationMessage', featureOptionLink),
		});
	});
}