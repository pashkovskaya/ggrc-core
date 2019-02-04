/*
 Copyright (C) 2019 Google Inc.
 Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
 */

import {
  isAdmin,
} from '../../plugins/utils/current-page-utils';
import {getCounts} from '../../plugins/utils/widgets-utils';
import router, {buildUrl} from '../../router';
import {isObjectVersion} from '../../plugins/utils/object-versions-utils';

const prohibitedMapList = Object.freeze({
  Issue: ['Assessment', 'Audit'],
  Assessment: ['Evidence'],
});

export default can.Map.extend({
  define: {
    counts: {
      get() {
        return getCounts();
      },
    },
    showTabs: {
      get() {
        let counts = this.attr('counts');
        let isEmptyCounts = can.isEmptyObject(counts.attr());
        return !isEmptyCounts || isAdmin();
      },
    },
    showAllTabs: {
      get() {
        let instance = this.attr('instance');
        let model = instance.constructor;
        return model.obj_nav_options.show_all_tabs;
      },
    },
  },
  instance: null,
  activeWidget: null,
  widgetDescriptors: [],
  widgetList: [],
  hiddenWidgets: null,
  initVM() {
    this.handleDescriptors();

    // add default sorting for hidden widgets by title
    let hiddenWidgets = new can.List();
    hiddenWidgets.attr('comparator', 'title');
    this.attr('hiddenWidgets', hiddenWidgets);

    // set up routing
    router.bind('widget', (ev, newVal) => {
      this.route(newVal);
    });

    this.route(router.attr('widget'));
  },
  /**
     * Converts all descriptors to tabs view models
     */
  handleDescriptors() {
    let descriptors = this.attr('widgetDescriptors');
    let widgets = _.map(descriptors,
      (descriptor) => this.createWidget(descriptor));

    widgets = _.sortBy(widgets, ['order', 'title']);

    this.attr('widgetList', widgets);
  },
  /**
     * Creates tab's view model
     * @param {Object} descriptor widget descriptor
     * @return {Object} view model
     */
  createWidget(descriptor) {
    let id = descriptor.widget_id;
    let widgetName = descriptor.widget_name;
    let title = typeof widgetName === 'function'
      ? widgetName() : widgetName;
    let countsName = descriptor.countsName ||
        (descriptor.content_controller_options &&
          descriptor.content_controller_options.countsName) ||
        descriptor.model.shortName;
    let model = this.attr('instance').constructor;
    let forceShowList = model.obj_nav_options.force_show_list || [];

    let widget = {
      id,
      title,
      type: isObjectVersion(id) ? 'version' : '',
      icon: descriptor.widget_icon,
      href: buildUrl({widget: id}),
      model: descriptor.model,
      order: descriptor.order,
      uncountable: descriptor.uncountable,
      forceRefetch: descriptor.forceRefetch,
      count: 0,
      countsName: !descriptor.uncountable ? countsName : '',
      forceShow: false,
      inForceShowList: _.includes(forceShowList, title),
    };

    return widget;
  },
  /**
     * Configures widgets to display in Add Tab button dropdown
     * @param {can.Map} widget widget object
     */
  updateHiddenWidgets(widget) {
    if (this.attr('showAllTabs')
        || widget.attr('inForceShowList')
        || widget.attr('type') === 'version'
        || widget.attr('uncountable')
        || this.isInProhibitedMap(widget)) {
      // widget will never be in hiddenWidgets
      return;
    }

    if (widget.attr('count') === 0 && !widget.attr('forceShow')) {
      // add to hidden widgets list
      this.addToHiddenWidgets(widget);
    } else {
      this.removeFromHiddenWidgets(widget);
    }
  },
  /**
     * Checks additional rules for hidden widgets
     * @param {can.Map} widget widget object
     * @return {boolean} whether widget is in prohibited list
     */
  isInProhibitedMap(widget) {
    const instanceType = this.attr('instance.type');
    const shortName = widget.model.shortName;

    return prohibitedMapList[instanceType] &&
        prohibitedMapList[instanceType].includes(shortName);
  },
  /**
     * Adds widget to hiddenWidgets for Add tab button
     * @param {can.Map} widget widget
     */
  addToHiddenWidgets(widget) {
    let hiddenWidgets = this.attr('hiddenWidgets');
    let hiddenWidget =
        _.find(hiddenWidgets, (hidden) => hidden.id === widget.id);

    if (!hiddenWidget) {
      hiddenWidgets.push(widget);
    }
  },
  /**
     * Removes widgets from hiddenWidgets for Add tab button
     * @param {can.Map} widget widget
     */
  removeFromHiddenWidgets(widget) {
    let hiddenWidgets = this.attr('hiddenWidgets');
    let index = _.findIndex(hiddenWidgets,
      (hiddenWidget) => hiddenWidget.id === widget.id);

    if (index > -1) {
      hiddenWidgets.splice(index, 1);
    }
  },
  /**
     * Handles selecting tab
     * @param {string} widgetId selected widget id
     */
  route(widgetId) {
    let widget = this.findWidgetById(widgetId);
    if (!widget && this.attr('widgetList').length) {
      let widgetId = this.attr('widgetList')[0].id;
      router.attr('widget', widgetId);
      return;
    }

    if (widget) {
      widget.attr('forceShow', true); // to show tabs with 0 count
      this.attr('activeWidget', widget);
      this.dispatch({type: 'activeChanged', widget});
      this.updateHiddenWidgets(widget);
    }
  },
  /**
     * Searches widget by Id in widgetList collection
     * @param {string} widgetId widget id
     * @return {can.Map} widget
     */
  findWidgetById(widgetId) {
    return _.find(this.attr('widgetList'),
      (widget) => widget.id === widgetId);
  },
  /**
     * Searches widget by countName in widgetList collection
     * @param {string} countsName counts name prop in widget
     * @return {can.Map} widget
     */
  findWidgetByCountsName(countsName) {
    return _.find(this.attr('widgetList'),
      (widget) => widget.countsName === countsName);
  },
  /**
     * Sets objects count for widget
     * @param {string} name countsName prop in widget
     * @param {*} count objects count
     */
  setWidgetCount(name, count) {
    let widget = this.findWidgetByCountsName(name);
    if (widget) {
      widget.attr({
        count,
      });

      this.updateHiddenWidgets(widget);
    }
  },
  /**
     * Handles tab closing
     * @param {Object} event contains closed widget
     */
  closeTab(event) {
    let widget = event.widget;
    widget.attr('forceShow', false);

    let currentWidget = router.attr('widget');
    if (currentWidget === widget.id) {
      router.attr('widget', this.attr('widgetList.0.id')); // Switch to the first widget
    }

    this.updateHiddenWidgets(widget);
  },
});
