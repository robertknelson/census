using System;
using System.Collections.Generic;
using System.Text.Json.Nodes;
using Gatehouse.CommandQuery;
using Gatehouse.Identity;
using Microsoft.Data.SqlClient;
using Xunit;

namespace Gatehouse.Tests;

public class CommandQueryTests
{
    [Fact]
    public void A_command_key_is_domain_name_action()
    {
        var parameters = new Parameters().CommandQuery("feature", "list");
        Assert.True(parameters.TryParseQueryCommand(out var command));
        Assert.Equal(("gatehouse", "feature", "list", "feature.list"), (command.Domain, command.Name, command.Action, command.Discriminator));
    }

    [Fact]
    public void A_key_of_other_than_three_parts_is_no_command()
    {
        Assert.False(new Parameters().AddParam("key", "gatehouse.feature").TryParseQueryCommand(out _));
        Assert.False(new Parameters().TryParseQueryCommand(out _));
    }

    [Fact]
    public void Parameters_are_case_insensitive_and_blank_is_absent()
    {
        IParameters parameters = new Parameters().AddParam("FeatureId", 7).AddParam("name", " ");
        Assert.True(parameters.TryGet("featureid", out int id));
        Assert.Equal(7, id);
        Assert.False(parameters.TryGet("name", out string _));
        Assert.False(parameters.TryGet("featureId", out string _));
    }

    [Fact]
    public void Two_components_cannot_claim_one_key()
    {
        var a = new Claiming("gatehouse.x.y");
        var b = new Claiming("gatehouse.x.y");
        Assert.Throws<InvalidOperationException>(() => new SqlCommandInitializerContainer(new ISqlCommandInitializer[] { a, b }));
    }

    [Fact]
    public void An_unknown_key_names_itself()
    {
        var locator = new SqlCommandInitializerContainer(new ISqlCommandInitializer[] { new Claiming("gatehouse.x.y") });
        var error = Assert.Throws<KeyNotFoundException>(() => locator.GetInitializer("gatehouse", "x.z"));
        Assert.Contains("x.z", error.Message);
    }

    [Fact]
    public void Camel_case_reaches_nested_objects_and_arrays()
    {
        var node = JsonNode.Parse("""{"FeatureId":1,"Roles":[{"RoleName":"a"}]}""").ToCamelCase();
        Assert.Equal(1, (int)node["featureId"]);
        Assert.Equal("a", (string)node["roles"][0]["roleName"]);
    }

    [Theory]
    [InlineData(@"CONTOSO\jdoe", "CONTOSO", "jdoe")]
    [InlineData("jdoe", null, "jdoe")]
    [InlineData(@"CONTOSO\ jdoe ", "CONTOSO", "jdoe")]
    public void The_windows_name_gives_the_membership_identifier(string name, string domain, string username)
    {
        Assert.Equal((domain, username), name.SplitWindowsIdentity());
    }

    private sealed class Claiming : SqlCommandInitializer
    {
        public Claiming(string key) => Initializers.Add(key, (SqlCommand c, IParameters p, JsonNode n) => { });
    }
}
