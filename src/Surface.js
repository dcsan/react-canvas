"use strict";

import React from "react";
import PropTypes from "prop-types";
import ReactUpdates from "react-dom/lib/ReactUpdates";
import RenderLayer from "./RenderLayer";
import { make } from "./FrameUtils";
import { drawRenderLayer } from "./DrawingUtils";
import hitTest from "./hitTest";
import layoutNode from "./layoutNode";
import container from "./ContainerDecorator";

/**
 * Surface is a standard React component and acts as the main drawing canvas.
 * ReactCanvas components cannot be rendered outside a Surface.
 */
@container
class Surface extends React.Component {
  displayName = "Surface";

  propTypes = {
    className: PropTypes.string,
    id: PropTypes.string,
    top: PropTypes.number.isRequired,
    left: PropTypes.number.isRequired,
    width: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired,
    scale: PropTypes.number.isRequired,
    enableCSSLayout: PropTypes.bool,
    children: PropTypes.object,
    style: PropTypes.object
  };

  getDefaultProps = () => {
    return {
      scale: window.devicePixelRatio || 1
    };
  };

  setCanvasRef = canvas => {
    this.canvas = canvas;
  };

  componentDidMount = () => {
    // Prepare the <canvas> for drawing.
    this.scale();

    // ContainerMixin expects `this.node` to be set prior to mounting children.
    // `this.node` is injected into child components and represents the current
    // render tree.
    this.node = new RenderLayer();
    this.node.frame = make(
      this.props.left,
      this.props.top,
      this.props.width,
      this.props.height
    );
    this.node.draw = this.batchedTick;

    // This is the integration point between custom canvas components and React
    const transaction = ReactUpdates.ReactReconcileTransaction.getPooled();
    transaction.perform(
      this.mountAndInjectChildrenAtRoot,
      this,
      this.props.children,
      transaction
    );
    ReactUpdates.ReactReconcileTransaction.release(transaction);

    // Execute initial draw on mount.
    this.node.draw();
  };

  componentWillUnmount = () => {
    // Implemented in ReactMultiChild.Mixin
    this.unmountChildren();
  };

  componentDidUpdate = prevProps => {
    // We have to manually apply child reconciliation since child are not
    // declared in render().
    const transaction = ReactUpdates.ReactReconcileTransaction.getPooled();
    transaction.perform(
      this.updateChildrenAtRoot,
      this,
      this.props.children,
      transaction
    );
    ReactUpdates.ReactReconcileTransaction.release(transaction);

    // Re-scale the <canvas> when changing size.
    if (
      prevProps.width !== this.props.width ||
      prevProps.height !== this.props.height
    ) {
      this.scale();
    }

    // Redraw updated render tree to <canvas>.
    if (this.node) {
      this.node.draw();
    }
  };

  render() {
    // Scale the drawing area to match DPI.
    const width = this.props.width * this.props.scale;
    const height = this.props.height * this.props.scale;
    let style = {};

    if (this.props.style) {
      style = Object.assign({}, this.props.style);
    }

    if (typeof this.props.width !== "undefined") {
      style.width = this.props.width;
    }

    if (typeof this.props.height !== "undefined") {
      style.height = this.props.height;
    }

    return React.createElement("canvas", {
      ref: this.setCanvasRef,
      className: this.props.className,
      id: this.props.id,
      width: width,
      height: height,
      style: style,
      onTouchStart: this.handleTouchStart,
      onTouchMove: this.handleTouchMove,
      onTouchEnd: this.handleTouchEnd,
      onTouchCancel: this.handleTouchEnd,
      onClick: this.handleClick,
      onContextMenu: this.handleContextMenu,
      onDoubleClick: this.handleDoubleClick
    });
  }

  // Drawing
  // =======

  getContext = () => {
    return this.canvas.getContext("2d");
  };

  scale = () => {
    this.getContext().scale(this.props.scale, this.props.scale);
  };

  batchedTick = () => {
    if (this._frameReady === false) {
      this._pendingTick = true;
      return;
    }
    this.tick();
  };

  tick = () => {
    // Block updates until next animation frame.
    this._frameReady = false;
    this.clear();
    this.draw();
    requestAnimationFrame(this.afterTick);
  };

  afterTick = () => {
    // Execute pending draw that may have been scheduled during previous frame
    this._frameReady = true;
    if (this._pendingTick) {
      this._pendingTick = false;
      this.batchedTick();
    }
  };

  clear = () => {
    this.getContext().clearRect(0, 0, this.props.width, this.props.height);
  };

  draw = () => {
    if (this.node) {
      if (this.props.enableCSSLayout) {
        layoutNode(this.node);
      }
      drawRenderLayer(this.getContext(), this.node);
    }
  };

  // Events
  // ======

  hitTest = e => {
    const hitTarget = hitTest(e, this.node, this.canvas);
    if (hitTarget) {
      hitTarget[hitTest.getHitHandle(e.type)](e);
    }
  };

  handleTouchStart = e => {
    const hitTarget = hitTest(e, this.node, this.canvas);
    let touch;
    if (hitTarget) {
      // On touchstart: capture the current hit target for the given touch.
      this._touches = this._touches || {};
      for (let i = 0, len = e.touches.length; i < len; i++) {
        touch = e.touches[i];
        this._touches[touch.identifier] = hitTarget;
      }
      hitTarget[hitTest.getHitHandle(e.type)](e);
    }
  };

  handleTouchMove = e => {
    this.hitTest(e);
  };

  handleTouchEnd = e => {
    // touchend events do not generate a pageX/pageY so we rely
    // on the currently captured touch targets.
    if (!this._touches) {
      return;
    }

    let hitTarget;
    const hitHandle = hitTest.getHitHandle(e.type);
    for (let i = 0, len = e.changedTouches.length; i < len; i++) {
      hitTarget = this._touches[e.changedTouches[i].identifier];
      if (hitTarget && hitTarget[hitHandle]) {
        hitTarget[hitHandle](e);
      }
      delete this._touches[e.changedTouches[i].identifier];
    }
  };

  handleClick = e => {
    this.hitTest(e);
  };

  handleContextMenu = e => {
    this.hitTest(e);
  };

  handleDoubleClick = e => {
    this.hitTest(e);
  };
}

export default Surface;