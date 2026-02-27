(function() {
    // Состояния
    let position = { x: 0, y: 0 };
    let circlePosition = { x: 0, y: 0 };
    let velocity = { x: 0, y: 0 };
    let lastPosition = { x: 0, y: 0 };
    let lastTime = Date.now();
    let isSticky = false;
    let scale = { x: 1, y: 1 };
    let rotation = 0;
    let isClicked = false;
    let isHovering = false;
    let circleSize = { width: 60, height: 60, borderRadius: 30 };
    let showCircle = false;
    let buttonHasBackground = false;
    let stretchEffect = { x: 1, y: 1 };
    let isPulling = false;
    let circleOffset = { x: 0, y: 0 };
    let circleSquash = { x: 1, y: 1 };
    let isInsideStickyArea = false;
    
    // Refs
    let rafId = null;
    let positionHistory = [];
    let rotationHistory = [];
    let stickyElement = null;
    let offsetHistory = [];
    let circleVelocity = { x: 0, y: 0 };
    let circleAnimation = { x: 0, y: 0 };
    let hoveredElement = null;
    let lastCircleSize = { width: 60, height: 60, borderRadius: 30 };
    
    // Константы
    const MAX_HISTORY = 5;
    const ROTATION_SMOOTH_HISTORY = 3;
    const OFFSET_SMOOTH_HISTORY = 3;
    const PADDING_NO_BG = 15;
    const STICKY_THRESHOLD_IN = 50;
    const STICKY_THRESHOLD_OUT_LARGE = 140;
    const STICKY_THRESHOLD_OUT_SMALL = 60;
    
    // DOM элементы
    let cursorCircle = null;
    let stickyCircle = null;
    let container = null;
    
    // Вспомогательные функции
    function lerp(start, end, factor) {
        return start + (end - start) * factor;
    }
    
    function distance(x1, y1, x2, y2) {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    }
    
    // Проверка наличия фона у элемента
    function hasBackground(element) {
        if (!element) return false;
        
        try {
            const style = window.getComputedStyle(element);
            const backgroundColor = style.backgroundColor;
            const backgroundImage = style.backgroundImage;
            
            const hasBgColor = backgroundColor && 
                              backgroundColor !== 'rgba(0, 0, 0, 0)' && 
                              backgroundColor !== 'transparent';
            
            const hasBgImage = backgroundImage && backgroundImage !== 'none';
            const hasBoxShadow = style.boxShadow && style.boxShadow !== 'none';
            
            return hasBgColor || hasBgImage || hasBoxShadow;
        } catch (e) {
            return false;
        }
    }
    
    // Получение метрик элемента
    function getElementMetrics(element) {
        const rect = element.getBoundingClientRect();
        
        const hasBg = hasBackground(element);
        buttonHasBackground = hasBg;
        
        const isSmallButton = rect.width < 80 && rect.height < 80;
        const computedStyle = window.getComputedStyle(element);
        const borderRadius = parseFloat(computedStyle.borderRadius) || 0;
        const isRound = borderRadius >= rect.width * 0.4 || borderRadius >= rect.height * 0.4;
        const isSmallRoundButton = isSmallButton && isRound;
        const isSmallElement = rect.width <= 100 && rect.height <= 100;
        
        if (hasBg) {
            return {
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height,
                borderRadius: borderRadius,
                center: {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                },
                originalRect: rect,
                hasBackground: true,
                isSmallRoundButton,
                isSmallElement
            };
        } else {
            const padding = PADDING_NO_BG;
            const finalWidth = rect.width + (padding * 2);
            const finalHeight = rect.height + (padding * 2);
            const minSide = Math.min(finalWidth, finalHeight);
            const finalBorderRadius = Math.min(30, minSide / 2);
            
            return {
                x: rect.left - padding,
                y: rect.top - padding,
                width: finalWidth,
                height: finalHeight,
                borderRadius: finalBorderRadius,
                center: {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                },
                originalRect: rect,
                hasBackground: false,
                isSmallRoundButton,
                isSmallElement
            };
        }
    }
    
    // Проверка внутри области
    function isCursorInsideStickyArea(cursorPos, metrics) {
        if (!metrics) return false;
        
        if (metrics.hasBackground) {
            return cursorPos.x >= metrics.originalRect.left && 
                   cursorPos.x <= metrics.originalRect.right && 
                   cursorPos.y >= metrics.originalRect.top && 
                   cursorPos.y <= metrics.originalRect.bottom;
        } else {
            return cursorPos.x >= metrics.x && 
                   cursorPos.x <= metrics.x + metrics.width && 
                   cursorPos.y >= metrics.y && 
                   cursorPos.y <= metrics.y + metrics.height;
        }
    }
    
    // Расчет эффектов
    function calculateStretchEffect(cursorPos, buttonCenter, elementRect, hasBackground, isInside) {
        if (!isSticky || !elementRect || hasBackground || isInside) {
            isPulling = false;
            return { x: 1, y: 1 };
        }
        
        const dx = cursorPos.x - buttonCenter.x;
        const dy = cursorPos.y - buttonCenter.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const maxDistForEffect = Math.max(elementRect.width, elementRect.height) * 1.5;
        const normalizedDist = Math.min(dist / maxDistForEffect, 1);
        
        const stretchIntensity = normalizedDist * 0.5;
        const angle = Math.atan2(dy, dx);
        
        const stretchX = 1 + Math.abs(Math.cos(angle)) * stretchIntensity;
        const stretchY = 1 + Math.abs(Math.sin(angle)) * stretchIntensity;
        
        isPulling = dist > 20;
        
        return {
            x: Math.min(stretchX, 2.0),
            y: Math.min(stretchY, 2.0)
        };
    }
    
    function calculateCircleOffset(cursorPos, buttonCenter, elementRect, hasBackground, isInside) {
        if (!isSticky || !elementRect || hasBackground || isInside) {
            return { x: 0, y: 0 };
        }
        
        const dx = cursorPos.x - buttonCenter.x;
        const dy = cursorPos.y - buttonCenter.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const maxOffsetDist = Math.max(elementRect.width, elementRect.height) * 1.8;
        const maxOffset = Math.min(elementRect.width, elementRect.height) * 0.4;
        
        if (dist < maxOffsetDist) {
            const offsetStrength = Math.min(dist / maxOffsetDist, 1);
            const smoothOffsetStrength = Math.pow(offsetStrength, 1.5);
            
            return {
                x: dx * smoothOffsetStrength * maxOffset / maxOffsetDist,
                y: dy * smoothOffsetStrength * maxOffset / maxOffsetDist
            };
        }
        
        const maxAllowedOffset = maxOffset * 0.3;
        return {
            x: Math.max(-maxAllowedOffset, Math.min(maxAllowedOffset, dx * 0.3)),
            y: Math.max(-maxAllowedOffset, Math.min(maxAllowedOffset, dy * 0.3))
        };
    }
    
    function calculateCircleSquash(cursorPos, buttonCenter, elementRect, offset, hasBackground, isInside) {
        if (!isSticky || !elementRect || hasBackground || isInside) {
            return { x: 1, y: 1 };
        }
        
        const dx = cursorPos.x - (buttonCenter.x + offset.x);
        const dy = cursorPos.y - (buttonCenter.y + offset.y);
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const maxSquashDist = Math.max(elementRect.width, elementRect.height) * 1.0;
        
        if (dist > 0) {
            const squashStrength = Math.min(dist / maxSquashDist, 0.2);
            const angle = Math.atan2(dy, dx);
            
            const squashX = 1 - Math.abs(Math.cos(angle)) * squashStrength;
            const squashY = 1 - Math.abs(Math.sin(angle)) * squashStrength;
            
            return {
                x: Math.max(0.7, squashX),
                y: Math.max(0.7, squashY)
            };
        }
        
        return { x: 1, y: 1 };
    }
    
    // Поиск элементов
    function findInteractiveElementUnderCursor(cursorPos) {
        const interactiveSelectors = [
            'button',
            'a[href]',
            '[role="button"]',
            '.logo',
            '.logo-image'
        ];
        
        const elements = document.elementsFromPoint(cursorPos.x, cursorPos.y);
        
        for (const element of elements) {
            const tagName = element.tagName.toLowerCase();
            const role = element.getAttribute('role');
            const className = element.className || '';
            
            const isFormField = tagName === 'input' || 
                               tagName === 'textarea' || 
                               tagName === 'select';
            
            if (isFormField) continue;
            
            const isInteractive = (
                tagName === 'button' ||
                tagName === 'a' ||
                role === 'button' ||
                className.includes('logo')
            );
            
            if (isInteractive) return element;
            
            let parent = element.parentElement;
            while (parent && parent !== document.body) {
                const parentClassName = parent.className || '';
                const parentRole = parent.getAttribute('role');
                
                if (parentClassName.includes('logo') || parentRole === 'button') {
                    return parent;
                }
                parent = parent.parentElement;
            }
        }
        
        return null;
    }
    
    function findClosestInteractiveElement(cursorPos) {
        const interactiveSelectors = [
            'button',
            'a[href]',
            '[role="button"]',
            '.logo',
            '.logo-image'
        ];
        
        const interactiveElements = document.querySelectorAll(interactiveSelectors.join(','));
        let closestElement = null;
        let closestDistance = Infinity;
        
        interactiveElements.forEach(element => {
            const tagName = element.tagName.toLowerCase();
            const isFormField = tagName === 'input' || 
                               tagName === 'textarea' || 
                               tagName === 'select';
            
            if (isFormField) return;
            
            const rect = element.getBoundingClientRect();
            const center = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };
            
            const dist = distance(cursorPos.x, cursorPos.y, center.x, center.y);
            
            if (dist < closestDistance) {
                closestDistance = dist;
                closestElement = element;
            }
        });
        
        return { element: closestElement, distance: closestDistance };
    }
    
    // Обновление размера круга
    function updateCircleSize(metrics) {
        const currentWidth = lastCircleSize.width;
        const currentHeight = lastCircleSize.height;
        const newWidth = metrics.width;
        const newHeight = metrics.height;
        
        const widthDiff = Math.abs(newWidth - currentWidth) / currentWidth;
        const heightDiff = Math.abs(newHeight - currentHeight) / currentHeight;
        
        if (widthDiff > 0.05 || heightDiff > 0.05) {
            circleSize = {
                width: metrics.width,
                height: metrics.height,
                borderRadius: metrics.borderRadius
            };
            
            lastCircleSize = {
                width: metrics.width,
                height: metrics.height,
                borderRadius: metrics.borderRadius
            };
            
            if (stickyCircle) {
                stickyCircle.style.width = circleSize.width + 'px';
                stickyCircle.style.height = circleSize.height + 'px';
                stickyCircle.style.borderRadius = circleSize.borderRadius + 'px';
            }
        }
    }
    
    // Создание DOM элементов
    function createElements() {
        container = document.createElement('div');
        container.className = 'cursor-container';
        
        cursorCircle = document.createElement('div');
        cursorCircle.className = 'cursor-circle';
        
        stickyCircle = document.createElement('div');
        stickyCircle.className = 'cursor-sticky-circle';
        stickyCircle.style.display = 'none';
        
        container.appendChild(cursorCircle);
        container.appendChild(stickyCircle);
        document.body.appendChild(container);
    }
    
    // Добавление стилей
    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            * {
                cursor: default !important;
            }
            
            .cursor-container {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 2147483647;
            }
            
            .cursor-circle {
                position: fixed;
                width: 60px;
                height: 60px;
                border-radius: 50%;
                transform-origin: center;
                pointer-events: none;
                z-index: 2147483647;
                will-change: transform;
                
                backdrop-filter: invert(100%) hue-rotate(180deg) contrast(1.2);
                -webkit-backdrop-filter: invert(100%) hue-rotate(180deg) contrast(1.2);
                
                transition: opacity 0.15s ease,
                           transform 0.2s ease;
            }
            
            .cursor-circle.hover {
                backdrop-filter: invert(100%) hue-rotate(180deg) contrast(1.4) brightness(1.15);
                -webkit-backdrop-filter: invert(100%) hue-rotate(180deg) contrast(1.4) brightness(1.15);
            }
            
            .cursor-circle.clicked {
                animation: lensClick 0.25s ease;
            }
            
            .cursor-sticky-circle {
                position: fixed;
                transform-origin: center;
                pointer-events: none;
                z-index: 2147483648;
                will-change: transform, opacity, width, height, border-radius;
                
                backdrop-filter: invert(100%) hue-rotate(180deg) contrast(1.2);
                -webkit-backdrop-filter: invert(100%) hue-rotate(180deg) contrast(1.2);
                
                transition: opacity 0.15s ease,
                           width 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
                           height 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
                           border-radius 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
                           transform 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            }
            
            .cursor-sticky-circle.pulling {
                backdrop-filter: invert(100%) hue-rotate(180deg) contrast(1.3) brightness(1.1);
                -webkit-backdrop-filter: invert(100%) hue-rotate(180deg) contrast(1.3) brightness(1.1);
            }
            
            .cursor-sticky-circle.clicked {
                animation: circleClick 0.2s ease;
            }
            
            @keyframes lensClick {
                0%, 100% { transform: translate(-50%, -50%) scale(1); }
                50% { transform: translate(-50%, -50%) scale(0.88); }
            }
            
            @keyframes circleClick {
                0%, 100% { transform: translate(-50%, -50%) scale(1); }
                50% { transform: translate(-50%, -50%) scale(0.94); }
            }
            
            @media (max-width: 768px), (hover: none) {
                .cursor-container {
                    display: none !important;
                }
            }
            
            .cursor-container * {
                transform: translateZ(0);
                backface-visibility: hidden;
                perspective: 1000;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Обработчики событий
    function handleMouseMove(e) {
        const now = Date.now();
        const dt = Math.min(now - lastTime, 32);
        
        if (dt > 0) {
            const newVelocity = {
                x: (e.clientX - lastPosition.x) / dt * 16,
                y: (e.clientY - lastPosition.y) / dt * 16
            };
            
            velocity.x = lerp(velocity.x, newVelocity.x, 0.5);
            velocity.y = lerp(velocity.y, newVelocity.y, 0.5);
            
            lastTime = now;
            lastPosition = { x: e.clientX, y: e.clientY };
        }
        
        positionHistory.push({ x: e.clientX, y: e.clientY });
        if (positionHistory.length > MAX_HISTORY) {
            positionHistory.shift();
        }
        
        const avgPosition = positionHistory.reduce(
            (acc, pos) => ({ x: acc.x + pos.x, y: acc.y + pos.y }),
            { x: 0, y: 0 }
        );
        const count = positionHistory.length;
        
        position = {
            x: avgPosition.x / count,
            y: avgPosition.y / count
        };
    }
    
    function handleMouseDown() {
        isClicked = true;
        cursorCircle.classList.add('clicked');
        stickyCircle.classList.add('clicked');
        
        setTimeout(() => {
            isClicked = false;
            cursorCircle.classList.remove('clicked');
            stickyCircle.classList.remove('clicked');
        }, 200);
    }
    
    function checkHover() {
        const elementUnderCursor = findInteractiveElementUnderCursor(position);
        const isOverInteractive = !!elementUnderCursor;
        
        isHovering = isOverInteractive;
        
        if (isOverInteractive) {
            cursorCircle.classList.add('hover');
            hoveredElement = elementUnderCursor;
        } else {
            cursorCircle.classList.remove('hover');
        }
    }
    
    // Анимация
    function animate() {
        let targetX = position.x;
        let targetY = position.y;
        let smoothFactor = 0.1;
        
        const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2);
        const maxSpeed = 50;
        const speedRatio = Math.min(speed / maxSpeed, 2);
        
        // Вращение и масштаб
        if (!isSticky) {
            if (speed > 10) {
                const angle = Math.atan2(velocity.y, velocity.x);
                
                rotationHistory.push(angle);
                if (rotationHistory.length > ROTATION_SMOOTH_HISTORY) {
                    rotationHistory.shift();
                }
                
                let sinSum = 0, cosSum = 0;
                rotationHistory.forEach(a => {
                    sinSum += Math.sin(a);
                    cosSum += Math.cos(a);
                });
                
                const avgAngle = Math.atan2(sinSum / rotationHistory.length, 
                                           cosSum / rotationHistory.length);
                
                const diff = avgAngle - rotation;
                const normalizedDiff = Math.atan2(Math.sin(diff), Math.cos(diff));
                rotation += normalizedDiff * 0.3;
                
                scale = {
                    x: 1 + speedRatio * 0.5,
                    y: 1 - speedRatio * 0.2
                };
            } else {
                const diff = -rotation;
                const normalizedDiff = Math.atan2(Math.sin(diff), Math.cos(diff));
                rotation += normalizedDiff * 0.08;
                
                scale = {
                    x: lerp(scale.x, 1, 0.15),
                    y: lerp(scale.y, 1, 0.15)
                };
            }
        } else {
            rotation = 0;
            scale = { x: 1, y: 1 };
        }
        
        // Логика прилипания
        const elementUnderCursor = findInteractiveElementUnderCursor(position);
        let closestElement = null;
        let closestDistance = Infinity;
        
        if (elementUnderCursor) {
            const rect = elementUnderCursor.getBoundingClientRect();
            const center = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };
            closestDistance = distance(position.x, position.y, center.x, center.y);
            closestElement = elementUnderCursor;
        } else {
            const { element, distance } = findClosestInteractiveElement(position);
            closestElement = element;
            closestDistance = distance;
        }
        
        // Прилипание
        if (closestElement && closestDistance < STICKY_THRESHOLD_IN && !isSticky) {
            const metrics = getElementMetrics(closestElement);
            const isInside = isCursorInsideStickyArea(position, metrics);
            isInsideStickyArea = isInside;
            
            showCircle = true;
            stickyCircle.style.display = 'block';
            
            updateCircleSize(metrics);
            
            if (metrics.hasBackground) {
                circleOffset = { x: 0, y: 0 };
                circleSquash = { x: 1, y: 1 };
                stretchEffect = { x: 1, y: 1 };
                isPulling = false;
                offsetHistory = [];
            } else if (isInside) {
                circleOffset = { x: 0, y: 0 };
                circleSquash = { x: 1, y: 1 };
                stretchEffect = { x: 1, y: 1 };
                isPulling = false;
            }
            
            targetX = metrics.center.x;
            targetY = metrics.center.y;
            
            isSticky = true;
            stickyElement = closestElement;
            
            smoothFactor = 0.2;
        } 
        // Отлипание
        else if (isSticky && stickyElement) {
            const metrics = getElementMetrics(stickyElement);
            const isInside = isCursorInsideStickyArea(position, metrics);
            isInsideStickyArea = isInside;
            
            // Эффекты для кнопок без фона
            if (!metrics.hasBackground && !isInside) {
                const newOffset = calculateCircleOffset(
                    position, metrics.center, metrics.originalRect,
                    metrics.hasBackground, isInside
                );
                
                offsetHistory.push(newOffset);
                if (offsetHistory.length > OFFSET_SMOOTH_HISTORY) {
                    offsetHistory.shift();
                }
                
                const smoothOffset = offsetHistory.reduce(
                    (acc, off) => ({ x: acc.x + off.x, y: acc.y + off.y }),
                    { x: 0, y: 0 }
                );
                const count = offsetHistory.length;
                
                const finalOffset = {
                    x: smoothOffset.x / count,
                    y: smoothOffset.y / count
                };
                
                circleOffset = finalOffset;
                
                circleSquash = calculateCircleSquash(
                    position, metrics.center, metrics.originalRect,
                    finalOffset, metrics.hasBackground, isInside
                );
                
                stretchEffect = calculateStretchEffect(
                    position,
                    { x: metrics.center.x + finalOffset.x, y: metrics.center.y + finalOffset.y },
                    metrics.originalRect, metrics.hasBackground, isInside
                );
                
                targetX = metrics.center.x + finalOffset.x;
                targetY = metrics.center.y + finalOffset.y;
            } else {
                targetX = metrics.center.x;
                targetY = metrics.center.y;
                circleOffset = { x: 0, y: 0 };
                circleSquash = { x: 1, y: 1 };
                stretchEffect = { x: 1, y: 1 };
                isPulling = false;
            }
            
            // Проверка отлипания
            const dist = distance(position.x, position.y, metrics.center.x, metrics.center.y);
            let threshold = metrics.isSmallElement ? STICKY_THRESHOLD_OUT_SMALL : STICKY_THRESHOLD_OUT_LARGE;
            if (!metrics.hasBackground) threshold += 40;
            
            if (dist > threshold) {
                showCircle = false;
                stickyCircle.style.display = 'none';
                isSticky = false;
                isInsideStickyArea = false;
                stickyElement = null;
                
                circleSize = { width: 60, height: 60, borderRadius: 30 };
                lastCircleSize = { width: 60, height: 60, borderRadius: 30 };
                circleOffset = { x: 0, y: 0 };
                circleSquash = { x: 1, y: 1 };
                stretchEffect = { x: 1, y: 1 };
                isPulling = false;
                offsetHistory = [];
            }
            
            smoothFactor = 0.2;
        }
        
        // Плавное движение
        if (!isSticky) {
            const springStrength = 0.2;
            const damping = 0.9;
            
            const dx = targetX - circleAnimation.x;
            const dy = targetY - circleAnimation.y;
            
            circleVelocity.x += dx * springStrength;
            circleVelocity.y += dy * springStrength;
            
            circleVelocity.x *= damping;
            circleVelocity.y *= damping;
            
            circleAnimation.x += circleVelocity.x;
            circleAnimation.y += circleVelocity.y;
            
            targetX = circleAnimation.x;
            targetY = circleAnimation.y;
            
            smoothFactor = 0.15;
        } else {
            circleAnimation.x = targetX;
            circleAnimation.y = targetY;
            circleVelocity = { x: 0, y: 0 };
        }
        
        // Финальная интерполяция
        const speedFactor = Math.min(speed / 20, 1);
        const dynamicSmoothFactor = lerp(smoothFactor, 0.25, speedFactor);
        
        circlePosition = {
            x: lerp(circlePosition.x, targetX, dynamicSmoothFactor),
            y: lerp(circlePosition.y, targetY, dynamicSmoothFactor)
        };
        
        // Обновление DOM
        updateDOM();
        
        rafId = requestAnimationFrame(animate);
    }
    
    function updateDOM() {
        if (!cursorCircle || !stickyCircle) return;
        
        // Обычный круг
        cursorCircle.style.left = circlePosition.x + 'px';
        cursorCircle.style.top = circlePosition.y + 'px';
        cursorCircle.style.transform = `translate(-50%, -50%) rotate(${rotation}rad) scale(${scale.x}, ${scale.y})`;
        cursorCircle.style.opacity = showCircle ? '0' : '1';
        
        // Sticky круг
        if (showCircle) {
            const shouldShowEffects = !buttonHasBackground && !isInsideStickyArea;
            const combinedTransform = shouldShowEffects
                ? `translate(${circleOffset.x}px, ${circleOffset.y}px) scale(${circleSquash.x}, ${circleSquash.y}) scale(${stretchEffect.x}, ${stretchEffect.y})`
                : 'translate(0px, 0px) scale(1, 1) scale(1, 1)';
            
            stickyCircle.style.left = circlePosition.x + 'px';
            stickyCircle.style.top = circlePosition.y + 'px';
            stickyCircle.style.transform = `translate(-50%, -50%) ${combinedTransform}`;
            
            if (isPulling) {
                stickyCircle.classList.add('pulling');
            } else {
                stickyCircle.classList.remove('pulling');
            }
        }
    }
    
    // Проверка поддержки
    function supportsBackdropFilter() {
        return CSS.supports('backdrop-filter', 'invert(1)') || 
               CSS.supports('-webkit-backdrop-filter', 'invert(1)');
    }
    
    function isFirefox() {
        return navigator.userAgent.toLowerCase().includes('firefox');
    }
    
    // Инициализация
    function init() {
        if (!supportsBackdropFilter() || isFirefox()) return;
        
        createElements();
        addStyles();
        
        // Инициализация позиций
        position = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        circlePosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        circleAnimation = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        lastPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        
        // Добавление обработчиков
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mousedown', handleMouseDown);
        setInterval(checkHover, 40);
        
        // Запуск анимации
        animate();
    }
    
    // Запуск при загрузке
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();