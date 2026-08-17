using System;
using System.Collections.Generic;
using System.Linq;

namespace Census.Web.Services;

/// <summary>
/// Resolves a machine's single presented class: asserted override wins, otherwise derived
/// from observed roles by fixed precedence (census-web-v2-ux.md §5.3). The observed roles
/// are never destroyed — callers surface them alongside the resolution as provenance.
/// </summary>
public static class MachineClassifier
{
    public static readonly string[] Precedence = ["DatabaseServer", "WebServer", "DevServer", "DevLaptop"];

    public const string Unclassified = "Unclassified";

    public static (string Class, string Source) Resolve(string overrideClass, IReadOnlyList<string> observedRoles)
    {
        if (!string.IsNullOrWhiteSpace(overrideClass)) return (overrideClass, "asserted");

        foreach (var cls in Precedence)
        {
            if (observedRoles.Contains(cls, StringComparer.OrdinalIgnoreCase)) return (cls, "observed");
        }
        return (Unclassified, "observed");
    }
}
