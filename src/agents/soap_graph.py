"""Two explicit SOAP operations on one LangGraph definition."""

from langgraph.graph import END, START, StateGraph

from src.agents.nodes.soap_nodes import make_nodes
from src.agents.soap_state import SoapPipelineState


def create_soap_pipeline(store, llm):
    nodes = make_nodes(store, llm)
    graph = StateGraph(SoapPipelineState)
    for name in (
        "normalize", "save_input", "extract_caps", "repair_caps", "check_caps", "save_caps",
        "load_snapshot", "render_soap", "repair_soap", "check_soap", "save_draft", "record_error",
    ):
        graph.add_node(name, nodes[name])
    async def operation_route(state):
        return "normalize" if state["operation"] == "extract" else "load_snapshot"

    graph.add_conditional_edges(START, operation_route)

    def route(state, success):
        return "record_error" if state.get("error") else success

    def next_or_error(target):
        async def decide(state):
            return route(state, target)
        return decide

    graph.add_conditional_edges("normalize", next_or_error("save_input"))
    graph.add_conditional_edges("save_input", next_or_error("extract_caps"))

    async def after_extract(state):
        error = state.get("error")
        if error and error.get("code") == "invalid_model_output" and not state.get("cap_repair_count"):
            return "repair_caps"
        return "record_error" if error else "check_caps"

    graph.add_conditional_edges("extract_caps", after_extract)
    graph.add_conditional_edges("repair_caps", next_or_error("check_caps"))
    graph.add_conditional_edges("check_caps", next_or_error("save_caps"))
    graph.add_conditional_edges("save_caps", next_or_error(END))
    graph.add_conditional_edges("load_snapshot", next_or_error("render_soap"))

    async def after_render(state):
        error = state.get("error")
        if error and error.get("code") == "invalid_model_output" and not state.get("soap_repair_count"):
            return "repair_soap"
        return "record_error" if error else "check_soap"

    graph.add_conditional_edges("render_soap", after_render)
    graph.add_conditional_edges("repair_soap", next_or_error("check_soap"))
    graph.add_conditional_edges("check_soap", next_or_error("save_draft"))
    graph.add_conditional_edges("save_draft", next_or_error(END))
    graph.add_edge("record_error", END)
    return graph.compile()
