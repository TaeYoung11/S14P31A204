from ai_domain.worker_messages.event import EventOutputRef


def test_event_output_ref_accepts_floor_plan_project_payload():
    floor_project = {
        "id": "project-1",
        "name": "Latest IFC Floor Plan",
        "unit": "mm",
        "floors": [],
        "rooms": [],
        "adjacency": [],
    }

    output = EventOutputRef.model_validate(
        {
            "storage_url": "s3://bucket/project/revision/ifc/model.v1.ifc",
            "floor_plan_project": floor_project,
        }
    )

    assert output.floorPlanProject == floor_project
    assert (
        output.model_dump(by_alias=True, exclude_none=True)["floor_plan_project"]
        == floor_project
    )
