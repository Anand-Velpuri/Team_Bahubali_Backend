
import React from 'react';

const LeafIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M11 20A7 7 0 0 1 4 13V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M15 10v10" />
    <path d="M12 4a2 2 0 0 0 2-2h4a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2" />
  </svg>
);

export default LeafIcon;
