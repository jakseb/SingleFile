/*
 * Copyright 2010-2019 Gildas Lormeau
 * contact : gildas.lormeau <at> gmail.com
 * 
 * This file is part of SingleFile.
 *
 *   The code in this file is free software: you can redistribute it and/or 
 *   modify it under the terms of the GNU Affero General Public License 
 *   (GNU AGPL) as published by the Free Software Foundation, either version 3
 *   of the License, or (at your option) any later version.
 * 
 *   The code in this file is distributed in the hope that it will be useful, 
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of 
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero 
 *   General Public License for more details.
 *
 *   As additional permission under GNU AGPL version 3 section 7, you may 
 *   distribute UNMODIFIED VERSIONS OF THIS file without the copy of the GNU 
 *   AGPL normally required by section 4, provided you include this license 
 *   notice and a URL through which recipients can access the Corresponding 
 *   Source.
 */

/* global hooksFrame */

this.docHelper = this.docHelper || (() => {

	const REMOVED_CONTENT_ATTRIBUTE_NAME = "data-single-file-removed-content";
	const PRESERVED_SPACE_ELEMENT_ATTRIBUTE_NAME = "data-single-file-preserved-space-element";
	const SHADOW_ROOT_ATTRIBUTE_NAME = "data-single-file-shadow-root-element";
	const WIN_ID_ATTRIBUTE_NAME = "data-frame-tree-win-id";
	const IMAGE_ATTRIBUTE_NAME = "data-single-file-image";
	const POSTER_ATTRIBUTE_NAME = "data-single-file-poster";
	const CANVAS_ATTRIBUTE_NAME = "data-single-file-canvas";
	const INPUT_VALUE_ATTRIBUTE_NAME = "data-single-file-value";
	const LAZY_SRC_ATTRIBUTE_NAME = "data-lazy-loaded-src";
	const IGNORED_REMOVED_TAG_NAMES = ["NOSCRIPT", "DISABLED-NOSCRIPT", "META", "LINK", "STYLE", "TITLE", "TEMPLATE", "SOURCE", "OBJECT", "SCRIPT"];
	const REGEXP_SIMPLE_QUOTES_STRING = /^'(.*?)'$/;
	const REGEXP_DOUBLE_QUOTES_STRING = /^"(.*?)"$/;
	const FONT_WEIGHTS = {
		normal: "400",
		bold: "700"
	};

	return {
		initDoc,
		preProcessDoc,
		postProcessDoc,
		serialize,
		removeQuotes,
		WIN_ID_ATTRIBUTE_NAME,
		PRESERVED_SPACE_ELEMENT_ATTRIBUTE_NAME,
		REMOVED_CONTENT_ATTRIBUTE_NAME,
		IMAGE_ATTRIBUTE_NAME,
		POSTER_ATTRIBUTE_NAME,
		CANVAS_ATTRIBUTE_NAME,
		INPUT_VALUE_ATTRIBUTE_NAME,
		SHADOW_ROOT_ATTRIBUTE_NAME
	};

	function initDoc(doc) {
		doc.querySelectorAll("meta[http-equiv=refresh]").forEach(element => {
			element.removeAttribute("http-equiv");
			element.setAttribute("disabled-http-equiv", "refresh");
		});
	}

	function preProcessDoc(doc, win, options) {
		doc.querySelectorAll("script").forEach(element => element.textContent = element.textContent.replace(/<\/script>/gi, "<\\/script>"));
		doc.querySelectorAll("noscript").forEach(element => {
			const disabledNoscriptElement = doc.createElement("disabled-noscript");
			Array.from(element.childNodes).forEach(node => disabledNoscriptElement.appendChild(node));
			disabledNoscriptElement.hidden = true;
			element.parentElement.replaceChild(disabledNoscriptElement, element);
		});
		initDoc(doc);
		if (doc.head) {
			doc.head.querySelectorAll("*:not(base):not(link):not(meta):not(noscript):not(script):not(style):not(template):not(title)").forEach(element => element.hidden = true);
		}
		let elementsInfo;
		if (win && doc.body) {
			elementsInfo = getElementsInfo(win, doc, doc.body, options);
		} else {
			elementsInfo = {
				canvasData: [],
				imagesData: [],
				postersData: [],
				usedFonts: [],
				shadowRootsData: []
			};
		}
		saveInputValues(doc);
		return {
			canvasData: elementsInfo.canvasData,
			fontsData: getFontsData(doc),
			stylesheetsData: getStylesheetsData(doc),
			imagesData: elementsInfo.imagesData,
			postersData: elementsInfo.postersData,
			usedFonts: Array.from(elementsInfo.usedFonts),
			shadowRootsData: elementsInfo.shadowRootsData,
			referrer: doc.referrer
		};
	}

	function getElementsInfo(win, doc, element, options, data = { usedFonts: new Set(), canvasData: [], imagesData: [], postersData: [], shadowRootsData: [] }, ascendantHidden) {
		const elements = Array.from(element.childNodes).filter(node => node instanceof win.HTMLElement);
		elements.forEach(element => {
			let elementHidden;
			if (options.removeHiddenElements || options.removeUnusedFonts || options.compressHTML) {
				const computedStyle = win.getComputedStyle(element);
				if (options.removeHiddenElements) {
					if (ascendantHidden) {
						Array.from(element.childNodes).filter(node => node instanceof win.HTMLElement).forEach(element => {
							if (!IGNORED_REMOVED_TAG_NAMES.includes(element.tagName)) {
								element.setAttribute(REMOVED_CONTENT_ATTRIBUTE_NAME, "");
							}
						});
					}
					elementHidden = ascendantHidden || testHiddenElement(element, computedStyle);
				}
				if (!elementHidden) {
					if (options.compressHTML) {
						const whiteSpace = computedStyle.getPropertyValue("white-space");
						if (whiteSpace.startsWith("pre")) {
							element.setAttribute(PRESERVED_SPACE_ELEMENT_ATTRIBUTE_NAME, "");
						}
					}
					if (options.removeUnusedFonts) {
						getUsedFont(computedStyle, options, data.usedFonts);
						getUsedFont(win.getComputedStyle(element, ":first-letter"), options, data.usedFonts);
						getUsedFont(win.getComputedStyle(element, ":before"), options, data.usedFonts);
						getUsedFont(win.getComputedStyle(element, ":after"), options, data.usedFonts);
					}
				}
			}
			getResourcesInfo(win, doc, element, options, data, elementHidden);
			if (element.shadowRoot) {
				const shadowRootInfo = {};
				element.setAttribute(SHADOW_ROOT_ATTRIBUTE_NAME, data.shadowRootsData.length);
				data.shadowRootsData.push(shadowRootInfo);
				getElementsInfo(win, doc, element.shadowRoot, options, data, elementHidden);
				shadowRootInfo.content = element.shadowRoot.innerHTML;
			}
			getElementsInfo(win, doc, element, options, data, elementHidden);
		});
		return data;
	}

	function getResourcesInfo(win, doc, element, options, data, elementHidden) {
		if (element.tagName == "CANVAS") {
			try {
				const size = getSize(win, element);
				data.canvasData.push({ dataURI: element.toDataURL("image/png", ""), width: size.width, height: size.height });
				element.setAttribute(CANVAS_ATTRIBUTE_NAME, data.canvasData.length - 1);
			} catch (error) {
				// ignored
			}
		}
		if (element.tagName == "IMG") {
			element.setAttribute(IMAGE_ATTRIBUTE_NAME, data.imagesData.length);
			const imageData = {
				currentSrc: elementHidden ?
					"data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" :
					(options.loadDeferredImages && element.getAttribute(LAZY_SRC_ATTRIBUTE_NAME)) || element.currentSrc
			};
			element.removeAttribute(LAZY_SRC_ATTRIBUTE_NAME);
			const computedStyle = win.getComputedStyle(element);
			if (computedStyle) {
				imageData.size = getSize(win, element);
				if ((!computedStyle.getPropertyValue("box-shadow") || computedStyle.getPropertyValue("box-shadow") == "none") &&
					(!computedStyle.getPropertyValue("background-image") || computedStyle.getPropertyValue("background-image") == "none") &&
					(imageData.size.pxWidth > 1 || imageData.size.pxHeight > 1)) {
					imageData.replaceable = true;
					imageData.backgroundColor = computedStyle.getPropertyValue("background-color");
					imageData.objectFit = computedStyle.getPropertyValue("object-fit");
					imageData.boxSizing = computedStyle.getPropertyValue("box-sizing");
					imageData.objectPosition = computedStyle.getPropertyValue("object-position");
				}
			}
			data.imagesData.push(imageData);
		}
		if (element.tagName == "VIDEO") {
			if (!element.poster) {
				const canvasElement = doc.createElement("canvas");
				const context = canvasElement.getContext("2d");
				canvasElement.width = element.clientWidth;
				canvasElement.height = element.clientHeight;
				try {
					context.drawImage(element, 0, 0, canvasElement.width, canvasElement.height);
					data.postersData.push(canvasElement.toDataURL("image/png", ""));
					element.setAttribute(POSTER_ATTRIBUTE_NAME, data.postersData.length - 1);
				} catch (error) {
					// ignored
				}
			}
		}
		if (element.tagName == "IFRAME") {
			if (elementHidden) {
				element.setAttribute("src", "data:text/html,");
			}
		}
	}

	function getUsedFont(computedStyle, options, usedFonts) {
		const fontStyle = computedStyle.getPropertyValue("font-style") || "normal";
		computedStyle.getPropertyValue("font-family").split(",").forEach(fontFamilyName => {
			fontFamilyName = normalizeFontFamily(fontFamilyName);
			if (!options.loadedFonts || options.loadedFonts.find(font => normalizeFontFamily(font.family) == fontFamilyName && font.style == fontStyle)) {
				const fontWeight = getFontWeight(computedStyle.getPropertyValue("font-weight"));
				const fontVariant = computedStyle.getPropertyValue("font-variant") || "normal";
				usedFonts.add([fontFamilyName, fontWeight, fontStyle, fontVariant]);
			}
		});
	}

	function normalizeFontFamily(fontFamilyName) {
		return removeQuotes(fontFamilyName.trim()).toLowerCase();
	}

	function testHiddenElement(element, computedStyle) {
		let hidden = false;
		if (computedStyle) {
			const display = computedStyle.getPropertyValue("display");
			const opacity = computedStyle.getPropertyValue("opacity");
			const visibility = computedStyle.getPropertyValue("visibility");
			hidden = display == "none";
			if (!hidden && (opacity == "0" || visibility == "hidden") && element.getBoundingClientRect) {
				const boundingRect = element.getBoundingClientRect();
				hidden = !boundingRect.width && !boundingRect.height;
			}
		}
		return Boolean(hidden);
	}

	function postProcessDoc(doc, options) {
		doc.querySelectorAll("disabled-noscript").forEach(element => {
			const noscriptElement = doc.createElement("noscript");
			Array.from(element.childNodes).forEach(node => noscriptElement.appendChild(node));
			element.parentElement.replaceChild(noscriptElement, element);
		});
		doc.querySelectorAll("meta[disabled-http-equiv]").forEach(element => {
			element.setAttribute("http-equiv", element.getAttribute("disabled-http-equiv"));
			element.removeAttribute("disabled-http-equiv");
		});
		if (doc.head) {
			doc.head.querySelectorAll("*:not(base):not(link):not(meta):not(noscript):not(script):not(style):not(template):not(title)").forEach(element => element.removeAttribute("hidden"));
		}
		if (options.removeHiddenElements) {
			doc.querySelectorAll("[" + REMOVED_CONTENT_ATTRIBUTE_NAME + "]").forEach(element => element.removeAttribute(REMOVED_CONTENT_ATTRIBUTE_NAME));
		}
		if (options.compressHTML) {
			doc.querySelectorAll("[" + PRESERVED_SPACE_ELEMENT_ATTRIBUTE_NAME + "]").forEach(element => element.removeAttribute(PRESERVED_SPACE_ELEMENT_ATTRIBUTE_NAME));
		}
		doc.querySelectorAll("[" + IMAGE_ATTRIBUTE_NAME + "]").forEach(element => element.removeAttribute(IMAGE_ATTRIBUTE_NAME));
		doc.querySelectorAll("[" + POSTER_ATTRIBUTE_NAME + "]").forEach(element => element.removeAttribute(POSTER_ATTRIBUTE_NAME));
		doc.querySelectorAll("[" + CANVAS_ATTRIBUTE_NAME + "]").forEach(element => element.removeAttribute(CANVAS_ATTRIBUTE_NAME));
		doc.querySelectorAll("[" + INPUT_VALUE_ATTRIBUTE_NAME + "]").forEach(element => element.removeAttribute(INPUT_VALUE_ATTRIBUTE_NAME));
		doc.querySelectorAll("[" + SHADOW_ROOT_ATTRIBUTE_NAME + "]").forEach(element => element.removeAttribute(SHADOW_ROOT_ATTRIBUTE_NAME));
	}

	function getStylesheetsData(doc) {
		if (doc) {
			const contents = [];
			doc.querySelectorAll("style").forEach((styleElement, styleIndex) => {
				let stylesheet;
				try {
					const tempStyleElement = doc.createElement("style");
					tempStyleElement.textContent = styleElement.textContent;
					doc.body.appendChild(tempStyleElement);
					stylesheet = tempStyleElement.sheet;
					tempStyleElement.remove();
					if (!stylesheet || stylesheet.cssRules.length != styleElement.sheet.cssRules.length) {
						contents[styleIndex] = Array.from(styleElement.sheet.cssRules).map(cssRule => cssRule.cssText).join("\n");
					}
				} catch (error) {
					/* ignored */
				}
			});
			return contents;
		}
	}

	function getSize(win, imageElement) {
		let pxWidth = imageElement.naturalWidth;
		let pxHeight = imageElement.naturalHeight;
		if (!pxWidth && !pxHeight) {
			const computedStyle = win.getComputedStyle(imageElement);
			let removeBorderWidth = false;
			if (computedStyle.getPropertyValue("box-sizing") == "content-box") {
				const boxSizingValue = imageElement.style.getPropertyValue("box-sizing");
				const boxSizingPriority = imageElement.style.getPropertyPriority("box-sizing");
				const clientWidth = imageElement.clientWidth;
				imageElement.style.setProperty("box-sizing", "border-box", "important");
				removeBorderWidth = imageElement.clientWidth != clientWidth;
				if (boxSizingValue) {
					imageElement.style.setProperty("box-sizing", boxSizingValue, boxSizingPriority);
				} else {
					imageElement.style.removeProperty("box-sizing");
				}
			}
			let paddingLeft, paddingRight, paddingTop, paddingBottom, borderLeft, borderRight, borderTop, borderBottom;
			paddingLeft = getWidth("padding-left", computedStyle);
			paddingRight = getWidth("padding-right", computedStyle);
			paddingTop = getWidth("padding-top", computedStyle);
			paddingBottom = getWidth("padding-bottom", computedStyle);
			if (removeBorderWidth) {
				borderLeft = getWidth("border-left-width", computedStyle);
				borderRight = getWidth("border-right-width", computedStyle);
				borderTop = getWidth("border-top-width", computedStyle);
				borderBottom = getWidth("border-bottom-width", computedStyle);
			} else {
				borderLeft = borderRight = borderTop = borderBottom = 0;
			}
			pxWidth = Math.max(0, imageElement.clientWidth - paddingLeft - paddingRight - borderLeft - borderRight);
			pxHeight = Math.max(0, imageElement.clientHeight - paddingTop - paddingBottom - borderTop - borderBottom);
		}
		return { pxWidth, pxHeight };
	}

	function getWidth(styleName, computedStyle) {
		if (computedStyle.getPropertyValue(styleName).endsWith("px")) {
			return parseFloat(computedStyle.getPropertyValue(styleName));
		}
	}

	function getFontsData() {
		if (typeof hooksFrame != "undefined") {
			return hooksFrame.getFontsData();
		}
	}

	function saveInputValues(doc) {
		doc.querySelectorAll("input").forEach(input => input.setAttribute(INPUT_VALUE_ATTRIBUTE_NAME, input.value));
		doc.querySelectorAll("input[type=radio], input[type=checkbox]").forEach(input => input.setAttribute(INPUT_VALUE_ATTRIBUTE_NAME, input.checked));
		doc.querySelectorAll("textarea").forEach(textarea => textarea.setAttribute(INPUT_VALUE_ATTRIBUTE_NAME, textarea.value));
		doc.querySelectorAll("select").forEach(select => {
			select.querySelectorAll("option").forEach(option => {
				if (option.selected) {
					option.setAttribute(INPUT_VALUE_ATTRIBUTE_NAME, "");
				}
			});
		});
	}

	function serialize(doc) {
		const docType = doc.doctype;
		let docTypeString = "";
		if (docType) {
			docTypeString = "<!DOCTYPE " + docType.nodeName;
			if (docType.publicId) {
				docTypeString += " PUBLIC \"" + docType.publicId + "\"";
				if (docType.systemId) {
					docTypeString += " \"" + docType.systemId + "\"";
				}
			} else if (docType.systemId) {
				docTypeString += " SYSTEM \"" + docType.systemId + "\"";
			} if (docType.internalSubset) {
				docTypeString += " [" + docType.internalSubset + "]";
			}
			docTypeString += "> ";
		}
		return docTypeString + doc.documentElement.outerHTML;
	}

	function removeQuotes(string) {
		if (string.match(REGEXP_SIMPLE_QUOTES_STRING)) {
			string = string.replace(REGEXP_SIMPLE_QUOTES_STRING, "$1");
		} else {
			string = string.replace(REGEXP_DOUBLE_QUOTES_STRING, "$1");
		}
		return string.trim();
	}

	function getFontWeight(weight) {
		return FONT_WEIGHTS[weight] || weight;
	}

})();