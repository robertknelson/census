using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Gatehouse.Membership.Data;

// Census's checks on the membership page's writes (MembershipAdmin.Validate there), at the boundary: every reason at
// once, in the page's words. The body is read into its shape only to be checked; it goes on to the initializer as sent.
public static class MembershipRequests
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    public static List<string> Check<T>(JsonNode body, Func<T, List<string>> validate)
    {
        T request;
        try
        {
            request = body is JsonObject ? body.Deserialize<T>(Web) : default;
        }
        catch (JsonException)
        {
            request = default;
        }
        return request == null ? new List<string> { "The request body is not in the shape this page sends." } : validate(request);
    }

    public static List<string> Validate(ApplicationSave request)
    {
        var errors = new List<string>();
        Require(errors, request.Identifier, "Identifier", 50);
        Require(errors, request.Name, "Name", 100);
        Require(errors, request.Disposition, "Disposition", 30);
        if ((request.Tags ?? "").Length > 510) errors.Add("Tags can be at most 510 characters.");
        if (request.ApplicationTypeId <= 0) errors.Add("Pick an application type.");
        if (!string.IsNullOrWhiteSpace(request.Settings))
        {
            try { using var _ = JsonDocument.Parse(request.Settings); }
            catch (JsonException) { errors.Add("Settings must be JSON."); }
        }
        return errors;
    }

    public static List<string> Validate(MemberSave request)
    {
        var errors = new List<string>();
        Require(errors, request.Identifier, "Identifier", 100);
        Require(errors, request.WindowsIdentity, "Windows identity", 72);
        Require(errors, request.FirstName, "First name", 100);
        Require(errors, request.LastName, "Last name", 100);
        if ((request.Email ?? "").Length > 100) errors.Add("Email can be at most 100 characters.");
        return errors;
    }

    public static List<string> Validate(GrantSave request) =>
        request.MemberId <= 0 || request.ApplicationId <= 0 || request.RoleId <= 0
            ? new List<string> { "A member, an application and a role are required." }
            : new List<string>();

    // An application's parts (personas.md §6.3 in Census): the roles it uses, its stages, its services.
    public static List<string> Validate(AppPartSave request)
    {
        var errors = new List<string>();
        if (request.ApplicationId <= 0) errors.Add("An application is required.");
        switch (request.Part)
        {
            case "role":
                if (request.RoleId <= 0) errors.Add("Pick a role.");
                if ((request.Alias ?? "").Trim().Length > 100) errors.Add("Alias can be at most 100 characters.");
                break;
            case "stage":
                if (request.StageId <= 0) errors.Add("Pick a stage.");
                Require(errors, request.Name, "Its name for the stage", 10);
                break;
            case "service":
                if (request.ServiceTypeId <= 0) errors.Add("Pick a service type.");
                if (!DateOnly.TryParse(request.StartOn, out _)) errors.Add("Start on must be a date (yyyy-MM-dd).");
                Require(errors, request.Status, "Status", 50);
                break;
            default:
                errors.Add("Part must be role, stage or service.");
                break;
        }
        return errors;
    }

    public static List<string> ValidateDelete(AppPartSave request) =>
        request.Part is not ("role" or "stage" or "service") || request.OldKey is null
            ? new List<string> { "Say which part to remove." }
            : new List<string>();

    private static void Require(List<string> errors, string value, string label, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) errors.Add($"{label} is required.");
        else if (value.Trim().Length > max) errors.Add($"{label} can be at most {max} characters.");
    }
}

public class ApplicationSave
{
    public string Identifier { get; set; }
    public string Name { get; set; }
    public string Tags { get; set; }
    public string Disposition { get; set; }
    public int ApplicationTypeId { get; set; }
    public string Settings { get; set; }
}

public class MemberSave
{
    public string Identifier { get; set; }
    public string WindowsIdentity { get; set; }
    public string FirstName { get; set; }
    public string LastName { get; set; }
    public string Email { get; set; }
}

public class AppPartSave
{
    public string Part { get; set; }
    public int ApplicationId { get; set; }
    public int? OldKey { get; set; }
    public int RoleId { get; set; }
    public string Alias { get; set; }
    public int StageId { get; set; }
    public string Name { get; set; }
    public int ServiceTypeId { get; set; }
    public string StartOn { get; set; }
    public string Status { get; set; }
}

public class GrantSave
{
    public int MemberId { get; set; }
    public int ApplicationId { get; set; }
    public int RoleId { get; set; }
}
