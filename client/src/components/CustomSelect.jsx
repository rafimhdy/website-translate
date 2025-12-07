import React, { useState, useRef, useEffect } from "react";

const CustomSelect = ({
  value,
  onChange,
  options,
  style,
  placeholder = "Select...",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Derive selected label directly instead of using state
  const selected = options.find((opt) => opt.value === value);
  const selectedLabel = selected ? selected.label : placeholder;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} style={{ position: "relative", ...style }}>
      {/* Select Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: "100%",
          padding: "16px 26px",
          paddingRight: "52px",
          border: "3px solid var(--border-gray)",
          borderRadius: "24px",
          fontSize: "16px",
          fontFamily: "Nunito, sans-serif",
          fontWeight: "800",
          color: "var(--text-dark)",
          backgroundColor: "white",
          cursor: "pointer",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: isOpen
            ? "0 0 0 5px rgba(88, 204, 2, 0.25), 0 4px 12px rgba(0, 0, 0, 0.1)"
            : "0 4px 12px rgba(0, 0, 0, 0.08)",
          borderColor: isOpen ? "var(--primary-green)" : "var(--border-gray)",
          textAlign: "left",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
        onMouseEnter={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = "var(--primary-green)";
            e.currentTarget.style.backgroundColor = "#f0fde4";
            e.currentTarget.style.transform = "translateY(-3px)";
            e.currentTarget.style.boxShadow =
              "0 12px 24px rgba(88, 204, 2, 0.3)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = "var(--border-gray)";
            e.currentTarget.style.backgroundColor = "white";
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)";
          }
        }}
      >
        <span>{selectedLabel}</span>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#58CC02"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transition: "transform 0.3s ease",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            position: "absolute",
            right: "18px",
          }}
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {/* Dropdown Options */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            backgroundColor: "white",
            border: "3px solid var(--primary-green)",
            borderRadius: "20px",
            boxShadow: "0 12px 32px rgba(88, 204, 2, 0.25)",
            zIndex: 1000,
            overflow: "hidden",
            animation: "dropdownSlide 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {options.map((option, index) => {
            const isSelected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                style={{
                  width: "100%",
                  padding: "16px 24px",
                  border: "none",
                  backgroundColor: isSelected ? "#58CC02" : "white",
                  color: isSelected ? "white" : "var(--text-dark)",
                  fontSize: "16px",
                  fontFamily: "Nunito, sans-serif",
                  fontWeight: isSelected ? "800" : "700",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.2s ease",
                  borderBottom:
                    index < options.length - 1 ? "1px solid #f0f0f0" : "none",
                  display: "block",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = "#f0fde4";
                    e.currentTarget.style.color = "var(--primary-green)";
                    e.currentTarget.style.paddingLeft = "28px";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = "white";
                    e.currentTarget.style.color = "var(--text-dark)";
                    e.currentTarget.style.paddingLeft = "24px";
                  }
                }}
              >
                {isSelected && <span style={{ marginRight: "8px" }}>✓</span>}
                {option.label}
              </button>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes dropdownSlide {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default CustomSelect;
