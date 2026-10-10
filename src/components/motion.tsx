'use client';

import { MotionConfig, motion, type HTMLMotionProps, type Transition } from 'motion/react';

/** One easing language across the app: quick out, soft landing. */
export const EASE = [0.2, 0.8, 0.2, 1] as const;
export const SPRING: Transition = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 };
export const SOFT: Transition = { duration: 0.45, ease: EASE };

/** Honors the OS "reduce motion" setting for every motion component beneath it. */
export function MotionRoot({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={SOFT}>{children}</MotionConfig>;
}

/** Fades content up the first time it scrolls into view. */
export function Reveal({
  delay = 0,
  y = 18,
  children,
  ...rest
}: { delay?: number; y?: number } & HTMLMotionProps<'div'>) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0, y }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '0px 0px -10% 0px' }}
        transition={{ ...SOFT, duration: 0.6, delay }}
        {...rest}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}

/** Staggers direct children in as a group. */
export const stagger = {
  parent: { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } },
  child: { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: SOFT } },
};

/** List item that animates in, out, and when its siblings reflow. */
export const listItem = {
  layout: true as const,
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.2 } },
  transition: SPRING,
};
