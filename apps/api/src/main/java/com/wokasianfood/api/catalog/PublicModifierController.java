package com.wokasianfood.api.catalog;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/v1/public/menu")
public class PublicModifierController {
    private final ModifierSelectionService service;
    public PublicModifierController(ModifierSelectionService service){this.service=service;}
    @GetMapping("/{menuItemId}/modifiers")
    public List<ModifierSelectionService.ModifierGroup> groups(@PathVariable UUID menuItemId){return service.groups(menuItemId);}
}
